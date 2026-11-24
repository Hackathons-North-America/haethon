/* Detail links are never prefetched. /hackathons/[slug] is rendered per
   request, so a prefetch cannot fetch the page itself — only its route tree —
   yet every card that scrolled into view still sent one request through the
   proxy and a function to get it: dozens of billed invocations per catalog
   visit for nothing the click then reuses. The click makes the same single
   request either way.

   Pass as `prefetch={DETAIL_LINK_PREFETCH}` on every <Link> to a hackathon's
   detail page that renders in a list. */
export const DETAIL_LINK_PREFETCH = false;
