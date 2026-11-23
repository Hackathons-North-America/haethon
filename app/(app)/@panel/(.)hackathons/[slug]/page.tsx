import { HackathonDetailView } from "@/components/hackathon-detail-view";
import { getCurrentUserId } from "@/lib/auth";
import { getHackathonPageData, getHackathonViewerData } from "@/lib/hackathons/detail-data";

/* Intercepts client-side navigation to /hackathons/[slug] from inside the app
   and shows the details in the side panel over the current page. Direct
   visits and reloads skip this and render app/(app)/hackathons/[slug]. */
export default async function HackathonPanelPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [pageData, userId] = await Promise.all([getHackathonPageData(slug), getCurrentUserId()]);

  // notFound() here would replace the page underneath too; keep the list and
  // say so inside the panel instead.
  if (!pageData) {
    return (
      <div className="px-2 pt-8">
        <h2 className="text-2xl font-semibold tracking-tight text-ink" id="hackathon-panel-title">
          Hackathon not found
        </h2>
        <p className="mt-2 text-sm text-ink/55">It may have been unpublished or moved.</p>
      </div>
    );
  }

  const viewer = await getHackathonViewerData(userId, pageData.hackathon.id);

  return <HackathonDetailView data={pageData} variant="panel" viewer={viewer} />;
}
