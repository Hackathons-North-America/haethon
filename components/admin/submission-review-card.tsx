"use client";

import { FormEvent, useState } from "react";
import { Check, GitMerge, X } from "lucide-react";

import { HackathonCardPreview } from "@/components/admin/hackathon-card-preview";

export type SubmissionReviewItem = {
  id: string;
  submitterEmail: string | null;
  submitterType: "organizer" | "community";
  organizationName: string | null;
  matchedHackathonId: string | null;
  status: "pending" | "approved" | "rejected" | "merged" | "withdrawn";
  payload: Record<string, unknown>;
  normalizedName: string;
  websiteUrl: string;
  sourceUrl: string;
  duplicateScore: string | null;
  createdAt: Date | string;
};

function value(payload: Record<string, unknown>, key: string, fallback = "") {
  const raw = payload[key];

  return typeof raw === "string" || typeof raw === "number" || typeof raw === "boolean" ? String(raw) : fallback;
}

function dateValue(payload: Record<string, unknown>, key: string) {
  const raw = value(payload, key);

  if (!raw) {
    return "";
  }

  const date = new Date(raw);

  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function importReason(payload: Record<string, unknown>) {
  return value(payload, "importReason") || value(payload, "reason");
}

const inputClassName =
  "w-full rounded-xl border border-navy/15 dark:border-white/15 bg-white dark:bg-white/[0.06] px-3 py-2 text-sm text-navy dark:text-wheat outline-none focus:border-cabernet focus:ring-2 focus:ring-cabernet/15";
const checkboxClassName = "size-4 rounded border-navy/20 dark:border-white/20 text-cabernet dark:text-[#e4a3ab] focus:ring-cabernet/20";
const labelClassName = "mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-navy/55 dark:text-wheat/55";

function initialPreviewPayload(submission: SubmissionReviewItem) {
  return {
    ...submission.payload,
    name: submission.normalizedName,
    organizationName: submission.organizationName ?? value(submission.payload, "organizationName"),
    sourceUrl: submission.sourceUrl,
    websiteUrl: submission.websiteUrl,
  };
}

export function SubmissionReviewCard({
  endpointBase,
  onReviewed,
  submission,
}: {
  endpointBase: string;
  onReviewed?: (submissionId: string) => void;
  submission: SubmissionReviewItem;
}) {
  const [status, setStatus] = useState<"idle" | "submitting" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [previewPayload, setPreviewPayload] = useState<Record<string, unknown>>(() => initialPreviewPayload(submission));
  const disabled = status === "submitting" || submission.status !== "pending";
  const fixReason = importReason(submission.payload);

  function updatePreview(key: string, nextValue: unknown) {
    if (!key) {
      return;
    }

    setPreviewPayload((current) => ({ ...current, [key]: nextValue }));
  }

  async function submitReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const intent = formData.get("intent")?.toString();

    setStatus("submitting");
    setMessage(null);

    const normalizedPayload = {
      name: formData.get("name")?.toString() ?? submission.normalizedName,
      organizationName: formData.get("organizationName")?.toString() ?? "",
      websiteUrl: formData.get("websiteUrl")?.toString() ?? submission.websiteUrl,
      imageUrl: formData.get("imageUrl")?.toString() ?? "",
      sourceUrl: formData.get("sourceUrl")?.toString() ?? submission.sourceUrl,
      applicationUrl: formData.get("applicationUrl")?.toString() ?? "",
      city: formData.get("city")?.toString() ?? "",
      region: formData.get("region")?.toString() ?? "",
      country: formData.get("country")?.toString() ?? "",
      venue: formData.get("venue")?.toString() ?? "",
      startDate: formData.get("startDate")?.toString() ?? "",
      endDate: formData.get("endDate")?.toString() ?? "",
      applicationOpensAt: formData.get("applicationOpensAt")?.toString() ?? "",
      applicationClosesAt: formData.get("applicationClosesAt")?.toString() ?? "",
      acceptanceAt: formData.get("acceptanceAt")?.toString() ?? "",
      format: formData.get("format")?.toString() ?? "in_person",
      shortDescription: formData.get("shortDescription")?.toString() ?? "",
      beginnerFriendly: formData.get("beginnerFriendly") === "on",
      travelReimbursement: formData.get("travelReimbursement") === "on",
      prizeAmountUsd: formData.get("prizeAmountUsd")?.toString() ?? "",
    };
    const reviewerNotes = formData.get("reviewerNotes")?.toString() ?? "";
    const body =
      intent === "reject"
        ? {
            action: "reject",
            rejectionReason: formData.get("rejectionReason")?.toString() ?? "",
            reviewerNotes,
          }
        : intent === "merge"
          ? {
              action: "merge",
              targetHackathonId: formData.get("targetHackathonId")?.toString() ?? "",
              reviewerNotes,
              normalizedPayload,
            }
          : {
              action: "approve_new",
              reviewerNotes,
              normalizedPayload,
            };

    const response = await fetch(`${endpointBase}/${submission.id}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = (await response.json()) as { error?: string };

    if (!response.ok) {
      setStatus("error");
      setMessage(result.error ?? "Review action failed.");
      return;
    }

    setStatus("done");
    setMessage("Review action saved.");
    onReviewed?.(submission.id);
  }

  return (
    <article className="rounded-xl border border-navy/10 dark:border-white/10 bg-white dark:bg-white/[0.06] p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-xl font-semibold text-navy dark:text-wheat">{submission.normalizedName}</h3>
            <span className="rounded-full bg-ivory dark:bg-white/5 px-2.5 py-1 text-xs font-semibold capitalize text-cabernet dark:text-[#e4a3ab]">
              {submission.submitterType}
            </span>
            <span className="rounded-full bg-ivory dark:bg-white/5 px-2.5 py-1 text-xs font-semibold capitalize text-navy/55 dark:text-wheat/55">
              {submission.status}
            </span>
          </div>
          <p className="mt-1 text-sm text-navy/55 dark:text-wheat/55">
            {submission.submitterEmail ?? "Unknown submitter"} · {submission.organizationName ?? value(submission.payload, "organizationName", "No organization")}
          </p>
        </div>
        <div className="text-right text-sm text-navy/55 dark:text-wheat/55">
          <p>Duplicate score</p>
          <p className="text-lg font-semibold text-navy dark:text-wheat">{submission.duplicateScore ?? "0.00"}</p>
        </div>
      </div>

      <form onSubmit={submitReview} className="mt-5 space-y-5">
        {fixReason ? (
          <div className="rounded-xl border border-[#B54708]/25 bg-[#FFFAEB] p-4 text-sm leading-6 text-[#704600]">
            <p className="font-semibold text-[#B54708]">Needs fix</p>
            <p className="mt-1">{fixReason}</p>
          </div>
        ) : null}

        <div className="grid gap-5 xl:grid-cols-[minmax(18rem,0.9fr)_minmax(0,1.1fr)]">
          <div className="xl:sticky xl:top-6 xl:self-start">
            <HackathonCardPreview payload={previewPayload} previewId={`review-preview-${submission.id}`} />
          </div>

          <div
            className="grid gap-4 md:grid-cols-3"
            onChange={(event) => {
              const target = event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
              updatePreview(target.name, target instanceof HTMLInputElement && target.type === "checkbox" ? target.checked : target.value);
            }}
          >
          <div className="md:col-span-2">
            <label className={labelClassName} htmlFor={`${submission.id}-name`}>
              Event name
            </label>
            <input id={`${submission.id}-name`} name="name" defaultValue={submission.normalizedName} className={inputClassName} />
          </div>
          <div>
            <label className={labelClassName} htmlFor={`${submission.id}-organizationName`}>
              Organization
            </label>
            <input
              id={`${submission.id}-organizationName`}
              name="organizationName"
              defaultValue={submission.organizationName ?? value(submission.payload, "organizationName")}
              className={inputClassName}
            />
          </div>
          <div>
            <label className={labelClassName} htmlFor={`${submission.id}-websiteUrl`}>
              Website
            </label>
            <input id={`${submission.id}-websiteUrl`} name="websiteUrl" defaultValue={submission.websiteUrl} className={inputClassName} />
          </div>
          <div>
            <label className={labelClassName} htmlFor={`${submission.id}-sourceUrl`}>
              Source
            </label>
            <input id={`${submission.id}-sourceUrl`} name="sourceUrl" defaultValue={submission.sourceUrl} className={inputClassName} />
          </div>
          <div>
            <label className={labelClassName} htmlFor={`${submission.id}-imageUrl`}>
              Image URL
            </label>
            <input
              id={`${submission.id}-imageUrl`}
              name="imageUrl"
              type="url"
              defaultValue={value(submission.payload, "imageUrl")}
              className={inputClassName}
            />
          </div>
          <div>
            <label className={labelClassName} htmlFor={`${submission.id}-applicationUrl`}>
              Application
            </label>
            <input
              id={`${submission.id}-applicationUrl`}
              name="applicationUrl"
              defaultValue={value(submission.payload, "applicationUrl")}
              className={inputClassName}
            />
          </div>
          <div>
            <label className={labelClassName} htmlFor={`${submission.id}-startDate`}>
              Start
            </label>
            <input id={`${submission.id}-startDate`} name="startDate" type="date" defaultValue={dateValue(submission.payload, "startDate")} className={inputClassName} />
          </div>
          <div>
            <label className={labelClassName} htmlFor={`${submission.id}-endDate`}>
              End
            </label>
            <input id={`${submission.id}-endDate`} name="endDate" type="date" defaultValue={dateValue(submission.payload, "endDate")} className={inputClassName} />
          </div>
          <div>
            <label className={labelClassName} htmlFor={`${submission.id}-format`}>
              Format
            </label>
            <select id={`${submission.id}-format`} name="format" defaultValue={value(submission.payload, "format", "in_person")} className={inputClassName}>
              <option value="in_person">In person</option>
              <option value="online">Online</option>
              <option value="hybrid">Hybrid</option>
            </select>
          </div>
          <div>
            <label className={labelClassName} htmlFor={`${submission.id}-city`}>
              City
            </label>
            <input id={`${submission.id}-city`} name="city" defaultValue={value(submission.payload, "city")} className={inputClassName} />
          </div>
          <div>
            <label className={labelClassName} htmlFor={`${submission.id}-region`}>
              Region
            </label>
            <input id={`${submission.id}-region`} name="region" defaultValue={value(submission.payload, "region")} className={inputClassName} />
          </div>
          <div>
            <label className={labelClassName} htmlFor={`${submission.id}-country`}>
              Country
            </label>
            <input id={`${submission.id}-country`} name="country" defaultValue={value(submission.payload, "country")} className={inputClassName} />
          </div>
          <div>
            <label className={labelClassName} htmlFor={`${submission.id}-venue`}>
              Venue
            </label>
            <input id={`${submission.id}-venue`} name="venue" defaultValue={value(submission.payload, "venue")} className={inputClassName} />
          </div>
          <div>
            <label className={labelClassName} htmlFor={`${submission.id}-targetHackathonId`}>
              Merge target ID
            </label>
            <input
              id={`${submission.id}-targetHackathonId`}
              name="targetHackathonId"
              defaultValue={submission.matchedHackathonId ?? ""}
              className={inputClassName}
            />
          </div>
          <div className="md:col-span-2">
            <label className={labelClassName} htmlFor={`${submission.id}-shortDescription`}>
              Description
            </label>
            <textarea
              id={`${submission.id}-shortDescription`}
              name="shortDescription"
              rows={3}
              defaultValue={value(submission.payload, "shortDescription")}
              className={inputClassName}
            />
          </div>
          <div>
            <label className={labelClassName} htmlFor={`${submission.id}-applicationOpensAt`}>
              Applications open
            </label>
            <input
              id={`${submission.id}-applicationOpensAt`}
              name="applicationOpensAt"
              type="date"
              defaultValue={dateValue(submission.payload, "applicationOpensAt")}
              className={inputClassName}
            />
          </div>
          <div>
            <label className={labelClassName} htmlFor={`${submission.id}-applicationClosesAt`}>
              Applications close
            </label>
            <input
              id={`${submission.id}-applicationClosesAt`}
              name="applicationClosesAt"
              type="date"
              defaultValue={dateValue(submission.payload, "applicationClosesAt")}
              className={inputClassName}
            />
          </div>
          <div>
            <label className={labelClassName} htmlFor={`${submission.id}-acceptanceAt`}>
              Acceptance
            </label>
            <input
              id={`${submission.id}-acceptanceAt`}
              name="acceptanceAt"
              type="date"
              defaultValue={dateValue(submission.payload, "acceptanceAt")}
              className={inputClassName}
            />
          </div>
          <div>
            <label className={labelClassName} htmlFor={`${submission.id}-prizeAmountUsd`}>
              Prize USD
            </label>
            <input
              id={`${submission.id}-prizeAmountUsd`}
              name="prizeAmountUsd"
              type="number"
              min="0"
              defaultValue={value(submission.payload, "prizeAmountUsd")}
              className={inputClassName}
            />
          </div>
          <label className="flex items-center gap-2 rounded-xl border border-navy/10 dark:border-white/10 bg-ivory dark:bg-white/5 px-3 py-2 text-sm font-semibold text-navy dark:text-wheat">
            <input
              className={checkboxClassName}
              defaultChecked={value(submission.payload, "beginnerFriendly") === "true" || submission.payload.beginnerFriendly === true}
              name="beginnerFriendly"
              type="checkbox"
            />
            Beginner friendly
          </label>
          <label className="flex items-center gap-2 rounded-xl border border-navy/10 dark:border-white/10 bg-ivory dark:bg-white/5 px-3 py-2 text-sm font-semibold text-navy dark:text-wheat">
            <input
              className={checkboxClassName}
              defaultChecked={value(submission.payload, "travelReimbursement") === "true" || submission.payload.travelReimbursement === true}
              name="travelReimbursement"
              type="checkbox"
            />
            Travel support
          </label>
          <div>
            <label className={labelClassName} htmlFor={`${submission.id}-rejectionReason`}>
              Rejection reason
            </label>
            <textarea id={`${submission.id}-rejectionReason`} name="rejectionReason" rows={3} className={inputClassName} />
          </div>
          </div>
        </div>

        <details className="rounded-xl border border-navy/10 dark:border-white/10 bg-ivory dark:bg-white/5 p-4">
          <summary className="cursor-pointer text-sm font-semibold text-navy dark:text-wheat">Raw submission payload</summary>
          <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-xs text-navy/70 dark:text-wheat/70">
            {JSON.stringify(submission.payload, null, 2)}
          </pre>
        </details>

        <div>
          <label className={labelClassName} htmlFor={`${submission.id}-reviewerNotes`}>
            Reviewer notes
          </label>
          <textarea
            id={`${submission.id}-reviewerNotes`}
            name="reviewerNotes"
            rows={2}
            defaultValue={value(submission.payload, "importReason") ? `Fixed imported record: ${value(submission.payload, "importReason")}` : ""}
            className={inputClassName}
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            className="inline-flex min-h-10 items-center gap-2 rounded-full bg-[#027A48] px-4 text-sm font-semibold text-white disabled:opacity-50"
            disabled={disabled}
            name="intent"
            type="submit"
            value="approve_new"
          >
            <Check aria-hidden="true" className="size-4" />
            Approve new
          </button>
          <button
            className="inline-flex min-h-10 items-center gap-2 rounded-full bg-cabernet hover:bg-[#5c151c] px-4 text-sm font-semibold text-wheat dark:bg-wheat dark:text-[#141414] dark:hover:bg-white disabled:opacity-50"
            disabled={disabled}
            name="intent"
            type="submit"
            value="merge"
          >
            <GitMerge aria-hidden="true" className="size-4" />
            Merge
          </button>
          <button
            className="inline-flex min-h-10 items-center gap-2 rounded-full border border-[#B42318] px-4 text-sm font-semibold text-[#B42318] disabled:opacity-50"
            disabled={disabled}
            name="intent"
            type="submit"
            value="reject"
          >
            <X aria-hidden="true" className="size-4" />
            Reject
          </button>
          {message ? <p className={`text-sm font-semibold ${status === "error" ? "text-[#B42318]" : "text-[#027A48]"}`}>{message}</p> : null}
        </div>
      </form>
    </article>
  );
}
