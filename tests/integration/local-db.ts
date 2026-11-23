import { neonConfig } from "@neondatabase/serverless";

/* The integration suite truncates tables, so it only ever talks to the local
   throwaway database from docker-compose.test.yml (Postgres behind a local
   Neon HTTP proxy). Any other host is refused outright. */
export const LOCAL_DATABASE_URL = "postgres://postgres:postgres@db.localtest.me:5432/main";
const LOCAL_HOSTS = new Set(["db.localtest.me", "localhost", "127.0.0.1"]);
const PROXY_PORT = 4444;

export function configureLocalDatabase() {
  const url = process.env.TEST_DATABASE_URL ?? LOCAL_DATABASE_URL;
  const host = new URL(url).hostname;

  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(`Integration tests only run against a local database, not ${host}.`);
  }

  neonConfig.fetchEndpoint = (endpointHost) => `http://${endpointHost}:${PROXY_PORT}/sql`;
  process.env.DATABASE_URL = url;
  // The app's env schema also requires Clerk/cron settings the import code
  // never uses; skip that validation for tests.
  process.env.SKIP_ENV_VALIDATION = "1";

  return url;
}
