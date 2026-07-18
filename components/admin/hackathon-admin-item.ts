import type { HackathonSource } from "@/lib/hackathons/source-provenance";

/* Serialized shape of a single hackathon as returned to admin/organizer client
   components. Dates are ISO strings (not Date objects) so this stays safe to
   pass across the server → client boundary. Shared by the admin hackathons
   manager and the organizer dashboard. */
export type AdminHackathonListItem = {
  id: string;
  seriesId: string | null;
  /** Recurring flag of the hackathon's series; false when it has no series. */
  isRecurring: boolean;
  /** Existing channel managed for this hackathon's series in the configured guild. */
  discordChannelId?: string | null;
  /** Stored source badge, compiled at import time and admin-editable; null shows no badge. */
  source?: HackathonSource | null;
  name: string;
  shortDescription: string | null;
  websiteUrl: string | null;
  imageUrl: string | null;
  applicationUrl: string | null;
  venue: string | null;
  format: "online" | "in_person";
  status: string;
  beginnerFriendly: boolean;
  travelReimbursement: boolean;
  highSchoolersOnly: boolean;
  prizeAmountUsd: number | null;
  voteDisplayOffset: number;
  voteScore: number;
  city: string | null;
  region: string | null;
  country: string | null;
  startsAt: string | null;
  endsAt: string | null;
  applicationOpensAt: string | null;
  applicationClosesAt: string | null;
  acceptanceAt: string | null;
};

/* Normalize a DB row (Date objects) into the serialized client shape. Used by
   the admin page loader and the single-record GET endpoint so date handling
   stays consistent in one place. */
export function serializeAdminHackathon(row: {
  startsAt: Date | null;
  endsAt: Date | null;
  applicationOpensAt: Date | null;
  applicationClosesAt: Date | null;
  acceptanceAt: Date | null;
  [key: string]: unknown;
}): AdminHackathonListItem {
  return {
    ...(row as unknown as AdminHackathonListItem),
    startsAt: row.startsAt?.toISOString() ?? null,
    endsAt: row.endsAt?.toISOString() ?? null,
    applicationOpensAt: row.applicationOpensAt?.toISOString() ?? null,
    applicationClosesAt: row.applicationClosesAt?.toISOString() ?? null,
    acceptanceAt: row.acceptanceAt?.toISOString() ?? null,
  };
}
