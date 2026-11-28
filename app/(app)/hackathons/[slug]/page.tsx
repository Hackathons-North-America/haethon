import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { HackathonDetailView } from "@/components/hackathon-detail-view";
import { getHackathonPageData } from "@/lib/hackathons/detail-data";

/* The full-page detail view. Client-side navigation from the catalog or the
   My Hackathons board is intercepted by app/(app)/@panel and shown as a side
   panel instead; this page renders on direct visits, shared links and reloads.

   Static (ISR) and the same for everyone, like /hackathons: it must not read
   the request (no auth(), cookies() or headers()), and proxy.ts keeps document
   requests for it out of Clerk's proxy, so a shared or Discord link is served
   by the CDN without invoking a function. The viewer's vote and stage load in
   the browser. Rebuilt at most every 10 minutes, and sooner when a write
   calls revalidateHackathonCaches() (it inherits the detail cache tag through
   getHackathonPageData()). Next requires the literal number here. */
export const revalidate = 600;

/* No hackathons are built at deploy time; each is generated on its first visit. */
export function generateStaticParams() {
  return [];
}

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
  const pageData = await getHackathonPageData(slug);

  if (!pageData) {
    notFound();
  }

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

        <HackathonDetailView data={pageData} />
      </div>
    </main>
  );
}
