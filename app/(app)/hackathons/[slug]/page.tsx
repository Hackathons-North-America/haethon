import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { HackathonDetailView } from "@/components/hackathon-detail-view";
import { getCurrentUserId } from "@/lib/auth";
import { getHackathonPageData, getHackathonViewerData } from "@/lib/hackathons/detail-data";

/* The full-page detail view. Client-side navigation from the catalog or the
   My Hackathons board is intercepted by app/(app)/@panel and shown as a side
   panel instead; this page renders on direct visits, shared links and reloads. */

type PageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const hackathon = (await getHackathonPageData(slug))?.hackathon ?? null;

  if (!hackathon) {
    return { title: "Hackathon not found | Hackathons North America" };
  }

  return {
    title: `${hackathon.name} | Hackathons North America`,
    description: hackathon.shortDescription ?? `Dates, deadlines, and details for ${hackathon.name}.`,
  };
}

export default async function HackathonDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const [pageData, userId] = await Promise.all([getHackathonPageData(slug), getCurrentUserId()]);

  if (!pageData) {
    notFound();
  }

  const viewer = await getHackathonViewerData(userId, pageData.hackathon.id);

  return (
    <main className="min-h-screen px-5 pb-40 pt-10 sm:px-8 lg:px-12">
      <div className="mx-auto w-full max-w-[860px]">
        <Link
          className="inline-flex items-center gap-1.5 font-mono text-xs font-medium uppercase tracking-[0.14em] text-ink/55 transition-colors hover:text-pine"
          href="/hackathons"
        >
          <ArrowLeft aria-hidden="true" className="size-3.5" />
          Search
        </Link>

        <HackathonDetailView data={pageData} viewer={viewer} />
      </div>
    </main>
  );
}
