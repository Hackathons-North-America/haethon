import { neon, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { Agent, fetch as undiciFetch } from "undici";

import { env } from "@/lib/env";
import * as schema from "@/lib/db/schema";

/* Every query is one HTTPS request to Neon, so the HTTP client decides how
   much each query costs. The runtime's built-in fetch is the wrong client for
   that on two counts (both measured, see docs/perf/3-site-wide-efficiency.md):

   1. It drops idle sockets after 4 seconds. On a site where requests to one
      warm function instance are usually further apart than that, nearly every
      request re-does the TCP + TLS handshake to Neon before its first query.
      Neon keeps an idle connection usable for at least 55s, so hold ours for
      50s and reuse it.
   2. On Node 26 (undici 8) it speaks HTTP/2 to Neon and sends concurrent
      requests one at a time, so a Promise.all of N queries takes N round
      trips instead of one. Pinning HTTP/1.1 with one socket per in-flight
      query keeps parallel queries parallel on every Node version.

   The agent is module-scoped: one connection pool per function instance. */
const NEON_IDLE_SOCKET_MS = 50_000;

const neonAgent = new Agent({
  allowH2: false,
  keepAliveTimeout: NEON_IDLE_SOCKET_MS,
  keepAliveMaxTimeout: NEON_IDLE_SOCKET_MS,
});

neonConfig.fetchFunction = (input: Parameters<typeof undiciFetch>[0], init?: Parameters<typeof undiciFetch>[1]) =>
  undiciFetch(input, { ...init, dispatcher: neonAgent });

const sql = neon(env.DATABASE_URL);

export const db = drizzle({
  client: sql,
  schema,
});
