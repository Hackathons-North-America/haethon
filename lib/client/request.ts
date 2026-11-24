/* Shared fetch wrapper for client-side mutations. Every failure becomes a
   RequestError so background saves can tell "signed out" (open the login
   prompt) apart from "the server said no" (show its reason) and "the network
   dropped" (offer a retry). */

export class RequestError extends Error {
  readonly status: number;
  /** The server's own error text, when it sent one. */
  readonly serverMessage: string | null;

  constructor(message: string, status: number, serverMessage: string | null = null) {
    super(message);
    this.name = "RequestError";
    this.status = status;
    this.serverMessage = serverMessage;
  }

  get unauthenticated() {
    return this.status === 401;
  }

  get offline() {
    return this.status === 0;
  }
}

/**
 * Sends a request and returns the response's `data` field (or undefined when
 * there is none). Throws RequestError on network failure or a non-2xx status.
 */
export async function sendRequest<T = unknown>(
  url: string,
  init: RequestInit & { json?: unknown } = {}
): Promise<T> {
  const { json, ...rest } = init;
  let response: Response;

  try {
    response = await fetch(url, {
      ...rest,
      ...(json === undefined
        ? {}
        : { body: JSON.stringify(json), headers: { "Content-Type": "application/json", ...rest.headers } }),
    });
  } catch {
    throw new RequestError("Network request failed.", 0);
  }

  const payload = (await response.json().catch(() => null)) as { data?: unknown; error?: unknown } | null;

  if (!response.ok) {
    const serverMessage = typeof payload?.error === "string" ? payload.error : null;
    throw new RequestError(serverMessage ?? `Request failed with status ${response.status}.`, response.status, serverMessage);
  }

  return payload?.data as T;
}
