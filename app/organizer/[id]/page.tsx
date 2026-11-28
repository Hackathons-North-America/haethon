import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";

import { OrganizerHackathonWorkspace } from "@/components/organizer/detail/workspace";
import { parseWorkspaceTab } from "@/components/organizer/detail/shared";
import { getCurrentIdentity } from "@/lib/auth";
import { getManagedHackathon, getManagedHackathonPublicPath } from "@/lib/hackathons/organizer-service";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/* Memoized per request so generateMetadata and the page share one lookup. */
const loadManagedHackathon = cache((userId: string, role: string, hackathonId: string) =>
  getManagedHackathon({ userId, role, hackathonId })
);

/* The organizer console is private: never indexed, whatever the hackathon. */
const robots: Metadata["robots"] = { index: false, follow: false, nocache: true };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const context = await getCurrentIdentity();
  const item = context ? await loadManagedHackathon(context.userId, context.role, id) : null;

  return {
    title: item ? `${item.name} · Organizer console · HNA` : "Organizer console · HNA",
    robots,
  };
}

export default async function OrganizerHackathonPage({ params, searchParams }: PageProps) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const context = await getCurrentIdentity();

  // The layout already guards this; kept so the page never runs unauthenticated.
  if (!context) {
    redirect("/sign-in");
  }

  const item = await loadManagedHackathon(context.userId, context.role, id);

  if (!item) {
    notFound();
  }

  const publicPath = await getManagedHackathonPublicPath(item.id);
  // One clock for the header's phase badge on both the server and client render.
  const now = new Date().toISOString();

  return (
    <OrganizerHackathonWorkspace
      initialTab={parseWorkspaceTab(query.tab)}
      item={item}
      now={now}
      publicPath={publicPath}
    />
  );
}
