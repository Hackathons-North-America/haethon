import { createElement } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { reportBackgroundFailure, scheduleUndoableRequest, UNDO_WINDOW_MS } from "@/lib/client/background-actions";
import { RequestError, sendRequest } from "@/lib/client/request";
import { dismissToast, getToasts, showToast } from "@/lib/client/toast-store";
import { useLatestSave } from "@/lib/client/use-latest-save";

function clearToasts() {
  for (const toast of getToasts()) {
    dismissToast(toast.id);
  }
}

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
  vi.useFakeTimers();
  clearToasts();
});

afterEach(() => {
  clearToasts();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("toast store", () => {
  it("keeps at most three toasts and hides them after their duration", () => {
    for (const message of ["a", "b", "c", "d"]) {
      showToast({ message, duration: 1000 });
    }

    expect(getToasts().map((toast) => toast.message)).toEqual(["b", "c", "d"]);

    vi.advanceTimersByTime(1000);
    expect(getToasts()).toEqual([]);
  });
});

describe("sendRequest", () => {
  it("returns the data field and surfaces the server's error text", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { data: { ok: 1 } }))
      .mockResolvedValueOnce(jsonResponse(422, { error: "Name is required." }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(sendRequest("/x", { method: "PATCH", json: { a: 1 } })).resolves.toEqual({ ok: 1 });
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ body: '{"a":1}', method: "PATCH" });

    const error = await sendRequest("/x").catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(RequestError);
    expect((error as RequestError).serverMessage).toBe("Name is required.");
  });

  it("marks network failures as offline", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    const error = (await sendRequest("/x").catch((caught: unknown) => caught)) as RequestError;
    expect(error.offline).toBe(true);
  });
});

describe("reportBackgroundFailure", () => {
  it("offers a retry for server errors but not for rejected input", () => {
    const retry = vi.fn();

    reportBackgroundFailure(new RequestError("boom", 500), { message: "Couldn't save.", retry });
    expect(getToasts().at(-1)?.action?.label).toBe("Retry");

    reportBackgroundFailure(new RequestError("bad", 400, "Bad date."), { message: "Couldn't save.", retry });
    expect(getToasts().at(-1)).toMatchObject({ description: "Bad date.", action: undefined, tone: "error" });
  });

  it("opens the login prompt instead of a toast when signed out", () => {
    const listener = vi.fn();
    window.addEventListener("hna:login-required", listener);

    reportBackgroundFailure(new RequestError("unauthorized", 401), { message: "Couldn't save." });

    expect(listener).toHaveBeenCalledOnce();
    expect(getToasts()).toEqual([]);
    window.removeEventListener("hna:login-required", listener);
  });
});

describe("scheduleUndoableRequest", () => {
  it("sends nothing when the user presses Undo", () => {
    const fetchMock = vi.fn();
    const onUndo = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    scheduleUndoableRequest({ message: "Deleted X.", failureMessage: "nope", url: "/x", init: { method: "DELETE" }, onUndo });
    getToasts()[0].action?.onClick();
    vi.advanceTimersByTime(UNDO_WINDOW_MS * 2);

    expect(onUndo).toHaveBeenCalledOnce();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("commits after the undo window", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { data: null }));
    const onCommitted = vi.fn();
    const onUndo = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    scheduleUndoableRequest({
      message: "Deleted X.",
      failureMessage: "nope",
      url: "/x",
      init: { method: "DELETE" },
      onUndo,
      onCommitted,
    });

    vi.advanceTimersByTime(UNDO_WINDOW_MS - 1);
    expect(fetchMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledWith("/x", { method: "DELETE" });
    expect(onCommitted).toHaveBeenCalledOnce();
    expect(onUndo).not.toHaveBeenCalled();
  });

  it("restores the item and reports when the delete fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(500, { error: "Database unavailable." })));
    const onUndo = vi.fn();
    const retry = vi.fn();

    scheduleUndoableRequest({
      message: "Deleted X.",
      failureMessage: "Couldn't delete X.",
      url: "/x",
      init: { method: "DELETE" },
      onUndo,
      retry,
    });
    await vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS);

    expect(onUndo).toHaveBeenCalledOnce();
    expect(getToasts().at(-1)).toMatchObject({
      message: "Couldn't delete X.",
      description: "Database unavailable.",
      tone: "error",
    });
    getToasts().at(-1)?.action?.onClick();
    expect(retry).toHaveBeenCalledOnce();
  });
});

describe("useLatestSave", () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

  function mount<V>(send: (value: V) => Promise<unknown>, handlers: Parameters<typeof useLatestSave<V, unknown>>[1]) {
    const api: { save?: (value: V) => void } = {};

    function Harness() {
      api.save = useLatestSave(send, handlers).save;
      return null;
    }

    const root = createRoot(document.createElement("div"));
    act(() => root.render(createElement(Harness)));
    return { save: (value: V) => api.save?.(value), unmount: () => act(() => root.unmount()) };
  }

  it("sends only the newest value queued behind an in-flight request", async () => {
    const resolvers: Array<() => void> = [];
    const send = vi.fn(() => new Promise<void>((resolve) => resolvers.push(resolve)));
    const onSuccess = vi.fn();
    const { save, unmount } = mount<number>(send, { onSuccess, onError: vi.fn() });

    save(1);
    save(2);
    save(3);
    expect(send.mock.calls).toEqual([[1]]);

    await act(async () => resolvers[0]());
    expect(send.mock.calls).toEqual([[1], [3]]);
    expect(onSuccess).toHaveBeenLastCalledWith(undefined, 1, { latest: false });

    await act(async () => resolvers[1]());
    expect(onSuccess).toHaveBeenLastCalledWith(undefined, 3, { latest: true });
    unmount();
  });

  it("drops a failure that a newer click superseded, and reports the newest", async () => {
    const rejecters: Array<() => void> = [];
    const send = vi.fn(() => new Promise<void>((_resolve, reject) => rejecters.push(() => reject(new Error("x")))));
    const onError = vi.fn();
    const { save, unmount } = mount<number>(send, { onError });

    save(1);
    save(2);
    await act(async () => rejecters[0]());
    expect(onError).not.toHaveBeenCalled();

    await act(async () => rejecters[1]());
    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0][1]).toBe(2);
    unmount();
  });
});
