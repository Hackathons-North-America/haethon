/* Shared between tests/perf/setup.ts (which installs the stubs) and the bench
   files (which read the counters). A plain module singleton: vitest runs one
   bench file at a time in one module graph. */

export type PerfCounters = {
  /* HTTP requests the Neon driver made. A db.batch() is one round trip. */
  dbRoundTrips: number;
  /* Statements inside those requests. */
  dbStatements: number;
  discordCalls: string[];
};

export const perfState = {
  counters: { dbRoundTrips: 0, dbStatements: 0, discordCalls: [] } as PerfCounters,
  /* Callbacks handed to next/server `after()`; run by the bench once the
     handler has returned, which is when Next would run them. */
  afterTasks: [] as Array<() => unknown>,
  /* The signed-in user the stubbed Clerk session reports. */
  session: { clerkUserId: "user_perf_admin", appUserId: null as string | null, role: "admin" as "admin" | "user" },
  discordLatencyMs: Number(process.env.PERF_DISCORD_LATENCY_MS ?? 150),
  imageLatencyMs: Number(process.env.PERF_IMAGE_LATENCY_MS ?? 120),
};

export function resetCounters() {
  perfState.counters = { dbRoundTrips: 0, dbStatements: 0, discordCalls: [] };
}

export function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}
