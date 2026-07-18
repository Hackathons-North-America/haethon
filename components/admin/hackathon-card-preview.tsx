"use client";

import { HackathonCard, type HackathonCardData } from "@/components/hackathon-card";
import { formatDateRange } from "@/lib/hackathons/card-format";
import { HACKATHON_SOURCES, sourceBadge } from "@/lib/hackathons/source-provenance";

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

function parseDate(value: unknown) {
  const raw = text(value);

  if (!raw) {
    return null;
  }

  const date = new Date(raw);

  return Number.isNaN(date.getTime()) ? null : date;
}

function locationText(payload: PreviewPayload) {
  const format = text(payload.format, "in_person");

  if (format === "online") {
    return "Online";
  }

  const parts = [text(payload.city), text(payload.region)].filter(Boolean);

  if (parts.length) {
    return parts.join(", ");
  }

  return "Location to be announced";
}

export function previewPayloadToCard(payload: PreviewPayload, id = "admin-preview"): HackathonCardData {
  const name = text(payload.name, "Untitled hackathon");
  const source = HACKATHON_SOURCES.find((type) => type === payload.source);

  return {
    source: source ? sourceBadge(source) : null,
    beginnerFriendly: payload.beginnerFriendly === true,
    date: formatDateRange(parseDate(payload.startDate), parseDate(payload.endDate)),
    highSchoolersOnly: payload.highSchoolersOnly === true,
    id,
    image: text(payload.imageUrl) || null,
    isSaved: false,
    country: text(payload.format, "in_person") === "online" ? null : text(payload.country) || null,
    location: locationText(payload),
    name,
    travelReimbursement: payload.travelReimbursement === true,
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
  return <HackathonCard hackathon={previewPayloadToCard(payload, previewId)} preview />;
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
  highSchoolersOnly: "High school only",
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
    <div className="rounded-xl border border-navy/10 dark:border-white/10 bg-white dark:bg-white/[0.06] p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-navy/55 dark:text-wheat/55">Collected data</p>
      <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_minmax(0,1fr)]">
        {entries.map(([key, value]) => (
          <div className="contents" key={key}>
            <dt className="font-semibold text-navy dark:text-wheat">{labelForField(key)}</dt>
            <dd className="break-words text-navy/70 dark:text-wheat/70">
              {isUrl(value) ? (
                <a className="text-cabernet dark:text-[#e4a3ab] underline underline-offset-2 hover:no-underline" href={value} rel="noreferrer" target="_blank">
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
