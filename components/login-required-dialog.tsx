"use client";

import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type MouseEvent,
  type ReactNode,
} from "react";
import { LogIn, X } from "lucide-react";

const LOGIN_REQUIRED_EVENT = "hna:login-required";

type LoginRequiredDetail = {
  returnTo?: string;
};

// The signed-out default also keeps isolated component tests deterministic;
// the app-level provider replaces it with Clerk's actual loading/auth state.
const SignedInContext = createContext<boolean | undefined>(false);

export function LoginRequiredProvider({ children }: { children: ReactNode }) {
  const { isSignedIn } = useAuth();

  return <SignedInContext.Provider value={isSignedIn}>{children}</SignedInContext.Provider>;
}

/** Opens the shared login prompt from authenticated API actions. */
export function showLoginRequiredDialog(returnTo?: string) {
  window.dispatchEvent(
    new CustomEvent<LoginRequiredDetail>(LOGIN_REQUIRED_EVENT, {
      detail: { returnTo },
    })
  );
}

/**
 * A regular Next link for signed-in visitors. Signed-out clicks stay on the
 * current page and open the shared login prompt instead.
 */
export function LoginRequiredLink({
  forcePrompt = false,
  href,
  onClick,
  ...props
}: ComponentProps<typeof Link> & { forcePrompt?: boolean }) {
  const isSignedIn = useContext(SignedInContext);

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event);

    // While Clerk is loading, let the request proceed; the server-side route
    // protection remains authoritative and avoids a false logged-out prompt.
    if (event.defaultPrevented || (!forcePrompt && isSignedIn !== false)) {
      return;
    }

    event.preventDefault();
    showLoginRequiredDialog(typeof href === "string" ? href : href.pathname ?? undefined);
  }

  return <Link {...props} href={href} onClick={handleClick} />;
}

export function LoginRequiredDialog() {
  const [signInHref, setSignInHref] = useState("/sign-in");
  const [open, setOpen] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    function show(event: Event) {
      const { returnTo } = (event as CustomEvent<LoginRequiredDetail>).detail ?? {};
      const destination = returnTo ?? `${window.location.pathname}${window.location.search}`;

      setSignInHref(`/sign-in?redirect_url=${encodeURIComponent(destination)}`);
      setOpen(true);
    }

    window.addEventListener(LOGIN_REQUIRED_EVENT, show);
    return () => window.removeEventListener(LOGIN_REQUIRED_EVENT, show);
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  if (!open) {
    return null;
  }

  return (
    <div
      aria-labelledby="login-required-title"
      aria-modal="true"
      className="fixed inset-0 z-[100] grid place-items-center bg-ink/45 px-5 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          setOpen(false);
        }
      }}
      role="dialog"
    >
      <div className="relative w-full max-w-md border border-ink bg-paper p-7 shadow-[8px_8px_0_rgba(27,25,23,0.2)] sm:p-8">
        <button
          aria-label="Close login prompt"
          className="absolute right-3 top-3 grid size-9 place-items-center text-ink/55 hover:bg-ink/5 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine"
          onClick={() => setOpen(false)}
          ref={closeButtonRef}
          type="button"
        >
          <X aria-hidden="true" className="size-5" />
        </button>

        <div className="grid size-11 place-items-center rounded-full bg-pine text-paper">
          <LogIn aria-hidden="true" className="size-5" />
        </div>
        <h2 className="mt-5 pr-8 text-2xl font-semibold tracking-tight text-ink" id="login-required-title">
          You need to log in first
        </h2>
        <p className="mt-2 text-sm leading-6 text-ink/60">
          Log in to open this page and access your personal hackathon tools.
        </p>

        <div className="mt-7 flex flex-wrap items-center gap-3">
          <Link
            className="inline-flex min-h-10 items-center justify-center rounded-md border border-black bg-pine px-5 text-sm font-medium text-paper hover:bg-moss focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine"
            href={signInHref}
          >
            Log in
          </Link>
          <button
            className="inline-flex min-h-10 items-center justify-center px-4 text-sm font-medium text-ink/60 hover:bg-ink/5 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine"
            onClick={() => setOpen(false)}
            type="button"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
