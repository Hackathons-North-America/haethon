import { after } from "next/server";

/**
 * Runs `task` once the response has been sent: next/server after() when
 * called inside a request (route handler or server action), or straight away,
 * awaited, anywhere else (scripts, tests), where after() throws for want of a
 * request scope.
 *
 * Tasks handed here must be best-effort and catch their own errors: after()
 * has no caller left to report a failure to.
 */
export async function afterResponse(task: () => Promise<unknown>) {
  try {
    after(task);
    return;
  } catch {
    // Outside a request scope.
  }

  await task();
}
