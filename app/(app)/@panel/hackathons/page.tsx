/* Empty slot for /hackathons, so a soft navigation here closes an open panel.
   A slot with no matching page keeps showing its last content on client-side
   navigation. Every app/(app) route needs one of these files.

   Don't replace these with a [...catchAll]: (app) is a route group, so a
   catch-all here would match every top-level URL and 404 the routes outside
   the group, like /sign-in and /about. */
export default function HackathonsPanel() {
  return null;
}
