import { showLoginRequiredDialog } from "@/components/login-required-dialog";
import { RequestError, sendRequest } from "@/lib/client/request";
import { dismissToast, showToast, type ToastAction } from "@/lib/client/toast-store";

/**
 * Tells the user that a save running in the background failed. The caller has
 * already rolled its optimistic UI back; this only explains why and offers a
 * retry (or a custom `action`, e.g. reopening a form). A 401 opens the login
 * prompt instead of a toast.
 */
export function reportBackgroundFailure(
  error: unknown,
  {
    message,
    retry,
    action,
    undoneNote = "Your change was undone.",
  }: { message: string; retry?: () => void; action?: ToastAction; undoneNote?: string }
) {
  if (error instanceof RequestError && error.unauthenticated) {
    showLoginRequiredDialog();
    return;
  }

  // A 4xx means the server rejected the change itself (bad input, missing
  // record), so retrying the same request would only fail again.
  const retryable =
    !(error instanceof RequestError) ||
    error.offline ||
    error.status >= 500 ||
    error.status === 408 ||
    error.status === 429;

  const description =
    error instanceof RequestError
      ? error.offline
        ? `You appear to be offline. ${undoneNote}`
        : error.serverMessage ?? undoneNote
      : undoneNote;

  showToast({
    tone: "error",
    message,
    description,
    action: action ?? (retry && retryable ? { label: "Retry", onClick: retry } : undefined),
  });
}

type PendingCommit = { url: string; init: RequestInit };

/* Removals waiting out their undo window. If the page is closed or reloaded
   mid-window, they are sent immediately with keepalive so the user's delete
   still happens. */
const pendingCommits = new Map<number, PendingCommit>();
let flushListenerAttached = false;
let nextCommitId = 1;

function attachFlushListener() {
  if (flushListenerAttached || typeof window === "undefined") {
    return;
  }

  flushListenerAttached = true;
  window.addEventListener("pagehide", () => {
    for (const { url, init } of pendingCommits.values()) {
      void fetch(url, { ...init, keepalive: true }).catch(() => undefined);
    }

    pendingCommits.clear();
  });
}

export const UNDO_WINDOW_MS = 5000;

/**
 * Runs a removal with an undo window. The caller has already hidden the item;
 * this shows "<message> [Undo]" and only sends the request once the window
 * passes. Undo cancels the request and calls onUndo. If the request fails, the
 * item is restored with onUndo and a failure toast offers to retry.
 */
export function scheduleUndoableRequest({
  message,
  failureMessage,
  url,
  init,
  onUndo,
  onCommitted,
  retry,
}: {
  message: string;
  failureMessage: string;
  url: string;
  init: RequestInit;
  onUndo: () => void;
  onCommitted?: () => void;
  retry?: () => void;
}) {
  attachFlushListener();

  const commitId = nextCommitId++;
  pendingCommits.set(commitId, { url, init });

  const timer = setTimeout(async () => {
    if (!pendingCommits.delete(commitId)) {
      return;
    }

    try {
      await sendRequest(url, init);
      onCommitted?.();
    } catch (error) {
      onUndo();
      reportBackgroundFailure(error, { message: failureMessage, retry });
    }
  }, UNDO_WINDOW_MS);

  const toastId = showToast({
    message,
    duration: UNDO_WINDOW_MS,
    action: {
      label: "Undo",
      onClick: () => {
        if (!pendingCommits.delete(commitId)) {
          return;
        }

        clearTimeout(timer);
        dismissToast(toastId);
        onUndo();
      },
    },
  });
}
