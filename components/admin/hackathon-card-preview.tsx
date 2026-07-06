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
