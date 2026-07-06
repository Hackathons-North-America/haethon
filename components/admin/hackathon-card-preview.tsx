"use client";

import { HackathonCard, type HackathonCardData } from "@/components/hackathon-card";

export type PreviewPayload = Record<string, unknown>;

function text(value: unknown, fallback = "") {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? String(value) : fallback;
}

function dateText(value: unknown) {
  const raw = text(value);

  if (!raw) {
    return "";
  }

  const date = new Date(raw);

  if (Number.isNaN(date.getTime())) {
    return raw;
  }

  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  }).format(date);
}

function durationText(startDate: string, endDate: string) {
  if (!startDate && !endDate) {
    return "Dates to be announced";
  }

  if (!startDate || startDate === endDate) {
    return startDate || endDate;
  }

  return `${startDate} to ${endDate}`;
}

function locationText(payload: PreviewPayload) {
  const format = text(payload.format, "in_person");

  if (format === "online") {
    return "Online";
  }

  const parts = [text(payload.city), text(payload.region), text(payload.country)].filter(Boolean);

  if (parts.length) {
    return parts.join(", ");
  }

  return "Location to be announced";
}

function badges(payload: PreviewPayload) {
  const format = text(payload.format, "in_person");
  const items = [format === "online" ? "online" : "in person"];

  if (payload.beginnerFriendly === true || text(payload.beginnerFriendly) === "true") {
    items.push("Beginner friendly");
  }

  if (payload.travelReimbursement === true || text(payload.travelReimbursement) === "true") {
    items.push("Travel support");
  }

  const prizeAmountUsd = text(payload.prizeAmountUsd);

  if (prizeAmountUsd) {
    items.push(`$${prizeAmountUsd} prizes`);
  }

  return items;
}

export function previewPayloadToCard(payload: PreviewPayload, id = "admin-preview"): HackathonCardData {
  const name = text(payload.name, "Untitled hackathon");
  const startDate = dateText(payload.startDate);
  const endDate = dateText(payload.endDate);

  return {
    badges: badges(payload),
    date: startDate || "Date to be announced",
    description: text(payload.shortDescription, text(payload.websiteUrl, "No description provided.")),
    duration: durationText(startDate, endDate),
    id,
    image: text(payload.imageUrl) || null,
    isSaved: false,
    location: locationText(payload),
    name,
    userVote: 0,
    voteScore: 0,
  };
}

export function HackathonCardPreview({
  payload,
  previewId,
}: {
  payload: PreviewPayload;
  previewId?: string;
}) {
  return <HackathonCard hackathon={previewPayloadToCard(payload, previewId)} index={0} preview />;
}

const knownFieldLabels: Record<string, string> = {
  name: "Name",
  organizationName: "Organization",
  organizationId: "Organization ID",
  websiteUrl: "Website",
  sourceUrl: "Source",
  applicationUrl: "Application",
  imageUrl: "Image",
  externalId: "External ID",
  format: "Format",
  venue: "Venue",
  city: "City",
  region: "Region",
  country: "Country",
  startDate: "Start date",
  endDate: "End date",
  applicationOpensAt: "Applications open",
  applicationClosesAt: "Applications close",
  acceptanceAt: "Acceptances",
  timeNote: "Time note",
  beginnerFriendly: "Beginner friendly",
  travelReimbursement: "Travel reimbursement",
  prizeAmountUsd: "Prizes",
  shortDescription: "Description",
};

const dateFields = new Set(["startDate", "endDate", "applicationOpensAt", "applicationClosesAt", "acceptanceAt"]);

function labelForField(key: string) {
  return knownFieldLabels[key] ?? key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());
}

function detailValue(key: string, value: unknown) {
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (key === "prizeAmountUsd") {
    return `$${text(value)}`;
  }

  if (key === "format") {
    return text(value) === "online" ? "Online" : "In person";
  }

  if (dateFields.has(key)) {
    return dateText(value);
  }

  if (typeof value === "object" && value !== null) {
    return JSON.stringify(value);
  }

  return text(value);
}

function isUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

export function HackathonPayloadDetails({ payload }: { payload: PreviewPayload }) {
  const orderedKeys = [
    ...Object.keys(knownFieldLabels).filter((key) => key in payload),
    ...Object.keys(payload).filter((key) => !(key in knownFieldLabels)),
  ];
  const entries = orderedKeys
    .map((key) => [key, detailValue(key, payload[key])] as const)
    .filter(([, value]) => value !== "");

  if (!entries.length) {
    return null;
  }

  return (
    <div className="rounded-lg border border-black/10 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#706F6B]">Collected data</p>
      <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_minmax(0,1fr)]">
        {entries.map(([key, value]) => (
          <div className="contents" key={key}>
            <dt className="font-semibold text-black">{labelForField(key)}</dt>
            <dd className="break-words text-[#3F3E3A]">
              {isUrl(value) ? (
                <a className="text-[#660000] underline underline-offset-2 hover:no-underline" href={value} rel="noreferrer" target="_blank">
                  {value}
                </a>
              ) : (
                value
              )}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
