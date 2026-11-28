import type { AdminHackathonListItem } from "@/components/admin/hackathon-admin-item";

/* Serialized server-to-client shape of one managed hackathon (dates are ISO
   strings). Same shape the admin views use; see serializeManagedHackathon(). */
export type OrganizerHackathonItem = AdminHackathonListItem;

export const WORKSPACE_TABS = ["details", "checkin", "attendees"] as const;
export type WorkspaceTab = (typeof WORKSPACE_TABS)[number];

/** Reads a `?tab=` value; anything unknown (or missing) falls back to Details. */
export function parseWorkspaceTab(value: string | string[] | null | undefined): WorkspaceTab {
  const raw = Array.isArray(value) ? value[0] : value;

  return WORKSPACE_TABS.find((tab) => tab === raw) ?? "details";
}

/* The shared look, per the console's design language. */
export const cardClassName = "rounded-2xl border border-ink/10 bg-surface";
export const inputClassName =
  "w-full rounded-xl border border-ink/15 bg-paper px-3 py-2 text-sm text-ink outline-none transition-colors placeholder:text-ink/35 focus:border-pine focus:ring-2 focus:ring-pine/15 aria-[invalid=true]:border-danger";
export const labelClassName = "mb-1.5 block text-sm font-medium text-ink";
export const eyebrowClassName = "text-xs font-semibold uppercase tracking-[0.14em] text-ink/55";
export const checkboxClassName = "size-4 shrink-0 rounded border-ink/20 accent-pine text-pine focus:ring-pine/20";
export const focusRingClassName =
  "outline-none focus-visible:ring-2 focus-visible:ring-pine/40 focus-visible:ring-offset-2 focus-visible:ring-offset-paper";
const buttonBaseClassName = `inline-flex min-h-11 items-center justify-center gap-2 rounded-full text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${focusRingClassName}`;
const primaryButtonToneClassName = "bg-pine text-paper transition-opacity hover:opacity-90";
const secondaryButtonToneClassName = "border border-ink/15 bg-surface text-ink transition-colors hover:border-ink/30";
export const primaryButtonClassName = `${buttonBaseClassName} px-5 ${primaryButtonToneClassName}`;
export const secondaryButtonClassName = `${buttonBaseClassName} px-5 ${secondaryButtonToneClassName}`;
/* Same buttons with tighter padding on phones, for bars that must stay one row. */
export const compactPrimaryButtonClassName = `${buttonBaseClassName} px-3.5 sm:px-5 ${primaryButtonToneClassName}`;
export const compactSecondaryButtonClassName = `${buttonBaseClassName} px-3.5 sm:px-5 ${secondaryButtonToneClassName}`;

/* Status lines: errors in danger, confirmations in success. */
export function statusTextClassName(tone: "error" | "success") {
  return tone === "error" ? "text-danger" : "text-success";
}

/** Pulls a human message out of an API error body, or uses the fallback. */
export function apiErrorMessage(result: { error?: unknown } | null | undefined, fallback: string) {
  return typeof result?.error === "string" ? result.error : fallback;
}

export function formatDateTime(value: string) {
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
