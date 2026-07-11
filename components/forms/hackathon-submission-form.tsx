"use client";

import { FormEvent, useState } from "react";

type SubmitterType = "organizer" | "community";

// Sentinel source URL so reviewers can tell a submission came from this form
// rather than a scraped or imported source.
const FORM_SUBMISSION_SOURCE_URL = "https://haethon.local/submissions/community-form";

const inputClassName =
  "w-full rounded-none border-0 border-b border-navy/15 dark:border-white/15 bg-transparent px-0 py-2 text-[15px] text-navy dark:text-wheat outline-none transition-colors placeholder:text-navy/45 focus:border-cabernet";
const labelClassName =
  "mb-2 block font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-navy/55 dark:text-wheat/55";

function fieldValue(formData: FormData, name: string) {
  return formData.get(name)?.toString() ?? "";
}

function urlValue(formData: FormData, name: string) {
  const value = fieldValue(formData, name).trim();

  if (!value || /^https?:\/\//i.test(value)) {
    return value;
  }

  return `https://${value}`;
}

function optionalNumber(formData: FormData, name: string) {
  const value = fieldValue(formData, name);

  return value ? Number(value) : "";
}

function messageFromError(error: unknown) {
  if (typeof error === "string") {
    return error;
  }

  if (error && typeof error === "object" && "fieldErrors" in error) {
    const fieldErrors = (error as { fieldErrors: Record<string, string[] | undefined> }).fieldErrors;
    const [field, issues] = Object.entries(fieldErrors).find(([, value]) => value?.length) ?? [];

    if (field && issues) {
      return `${field}: ${issues[0]}`;
    }
  }

  return "Check the highlighted details and try again.";
}

export function HackathonSubmissionForm() {
  const [submitterType, setSubmitterType] = useState<SubmitterType>("community");
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setStatus("submitting");
    setMessage(null);

    const formData = new FormData(form);
    const commonPayload = {
      submitterType,
      name: fieldValue(formData, "name"),
      startDate: fieldValue(formData, "startDate"),
      endDate: fieldValue(formData, "endDate"),
      format: fieldValue(formData, "format"),
      country: fieldValue(formData, "country"),
      city: fieldValue(formData, "city"),
      region: fieldValue(formData, "region"),
      shortDescription: fieldValue(formData, "shortDescription"),
    };
    const payload =
      submitterType === "organizer"
        ? {
            ...commonPayload,
            organizationName: fieldValue(formData, "organizationName"),
            websiteUrl: urlValue(formData, "websiteUrl"),
            applicationOpensAt: fieldValue(formData, "applicationOpensAt"),
            applicationClosesAt: fieldValue(formData, "applicationClosesAt"),
            venue: fieldValue(formData, "venue"),
            beginnerFriendly: formData.get("beginnerFriendly") === "on",
            travelReimbursement: formData.get("travelReimbursement") === "on",
            prizeAmountUsd: optionalNumber(formData, "prizeAmountUsd"),
          }
        : {
            ...commonPayload,
            sourceUrl: FORM_SUBMISSION_SOURCE_URL,
            websiteUrl: urlValue(formData, "websiteUrl"),
          };

    try {
      const response = await fetch("/api/hackathon-submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await response.json()) as { error?: unknown; data?: { publishedDirectly?: boolean } };

      if (!response.ok) {
        setStatus("error");
        setMessage(messageFromError(body.error));
        return;
      }

      setStatus("success");
      setMessage(
        body.data?.publishedDirectly ? "Published directly for your verified organization." : "Submitted for review."
      );
      form.reset();
    } catch {
      setStatus("error");
      setMessage("Something went wrong sending your submission. Please try again.");
    }
  }

  return (
    <form onSubmit={onSubmit} className="border border-navy/10 dark:border-white/10 bg-white dark:bg-white/[0.06] text-navy dark:text-wheat">
      <div className="flex border-b border-navy/10 dark:border-white/10" role="tablist" aria-label="Submission type">
        {[
          {
            value: "community" as const,
            label: "Community",
            note: "Passersby who saw a hackathon and want to help",
          },
          {
            value: "organizer" as const,
            label: "Organizer",
            note: "Register your own hackathon",
          },
        ].map(({ value, label, note }) => (
          <button
            aria-selected={submitterType === value}
            className={`flex flex-1 flex-col items-center justify-center gap-1.5 border-b-2 px-4 py-4 outline-none transition-colors ${
              submitterType === value
                ? "border-cabernet dark:border-[#e4a3ab]/50 text-navy dark:text-wheat"
                : "border-transparent text-navy/55 dark:text-wheat/55 hover:text-navy dark:hover:text-wheat focus-visible:text-navy"
            }`}
            key={value}
            onClick={() => setSubmitterType(value)}
            role="tab"
            type="button"
          >
            <span className="font-mono text-xs font-medium uppercase tracking-[0.14em]">{label}</span>
            <span className="text-xs text-navy/55 dark:text-wheat/55">{note}</span>
          </button>
        ))}
      </div>

      <div className="space-y-10 p-6 sm:p-10">
        <div className="grid gap-x-8 gap-y-7 md:grid-cols-2">
          <div>
            <label className={labelClassName} htmlFor="name">
              Event name
            </label>
            <input id="name" name="name" required className={inputClassName} />
          </div>
          {submitterType === "organizer" ? (
            <>
              <div>
                <label className={labelClassName} htmlFor="organizationName">
                  Organization
                </label>
                <input id="organizationName" name="organizationName" required className={inputClassName} />
              </div>
              <div>
                <label className={labelClassName} htmlFor="websiteUrl">
                  Website URL
                </label>
                <input
                  id="websiteUrl"
                  name="websiteUrl"
                  required
                  type="text"
                  placeholder="www.example.com"
                  className={inputClassName}
                />
              </div>
            </>
          ) : (
            <div>
              <label className={labelClassName} htmlFor="websiteUrl">
                Website
              </label>
              <input
                id="websiteUrl"
                name="websiteUrl"
                required
                type="text"
                placeholder="No link? Put www.example.com"
                className={inputClassName}
              />
            </div>
          )}
        </div>

        <div className="grid gap-x-8 gap-y-7 md:grid-cols-4">
          <div>
            <label className={labelClassName} htmlFor="startDate">
              Start date
            </label>
            <input id="startDate" name="startDate" required type="date" className={inputClassName} />
          </div>
          <div>
            <label className={labelClassName} htmlFor="endDate">
              End date
            </label>
            <input id="endDate" name="endDate" required type="date" className={inputClassName} />
          </div>
          <div>
            <label className={labelClassName} htmlFor="format">
              Format
            </label>
            <select id="format" name="format" defaultValue="in_person" className={inputClassName}>
              <option value="in_person">In person</option>
              <option value="online">Online</option>
            </select>
          </div>
          <div>
            <label className={labelClassName} htmlFor="country">
              Country
            </label>
            <input id="country" name="country" required defaultValue="Canada" className={inputClassName} />
          </div>
        </div>

        <div className="grid gap-x-8 gap-y-7 md:grid-cols-3">
          <div>
            <label className={labelClassName} htmlFor="city">
              City
            </label>
            <input id="city" name="city" className={inputClassName} />
          </div>
          <div>
            <label className={labelClassName} htmlFor="region">
              Province / state
            </label>
            <input id="region" name="region" className={inputClassName} />
          </div>
          {submitterType === "organizer" ? (
            <div>
              <label className={labelClassName} htmlFor="venue">
                Venue
              </label>
              <input id="venue" name="venue" className={inputClassName} />
            </div>
          ) : null}
        </div>

        {submitterType === "organizer" ? (
          <div className="grid gap-x-8 gap-y-7 border-t border-navy/10 dark:border-white/10 pt-10 md:grid-cols-2">
            <div>
              <label className={labelClassName} htmlFor="applicationOpensAt">
                Application opens
              </label>
              <input id="applicationOpensAt" name="applicationOpensAt" type="date" className={inputClassName} />
            </div>
            <div>
              <label className={labelClassName} htmlFor="applicationClosesAt">
                Application due date
              </label>
              <input id="applicationClosesAt" name="applicationClosesAt" type="date" className={inputClassName} />
            </div>
            <div>
              <label className={labelClassName} htmlFor="prizeAmountUsd">
                Prize amount USD
              </label>
              <input id="prizeAmountUsd" name="prizeAmountUsd" min="0" type="number" className={inputClassName} />
            </div>
            <div className="flex items-end gap-6 pb-2">
              <label className="inline-flex items-center gap-2.5 text-sm text-navy dark:text-wheat">
                <input name="beginnerFriendly" type="checkbox" className="size-4 accent-cabernet" />
                Beginner friendly
              </label>
              <label className="inline-flex items-center gap-2.5 text-sm text-navy dark:text-wheat">
                <input name="travelReimbursement" type="checkbox" className="size-4 accent-cabernet" />
                Travel reimbursement
              </label>
            </div>
          </div>
        ) : null}

        <div>
          <label className={labelClassName} htmlFor="shortDescription">
            {submitterType === "organizer" ? "Short description" : "Notes"}
          </label>
          <textarea
            id="shortDescription"
            name="shortDescription"
            required={submitterType === "organizer"}
            rows={4}
            className={inputClassName}
          />
        </div>

        <div className="flex flex-wrap items-center gap-4 border-t border-navy/10 dark:border-white/10 pt-8">
          <button
            disabled={status === "submitting"}
            type="submit"
            className="inline-flex rounded-full min-h-11 items-center justify-center border border-cabernet dark:border-[#e4a3ab]/50 px-6 font-mono text-xs font-medium uppercase tracking-[0.14em] text-cabernet dark:text-[#e4a3ab] transition-colors hover:bg-cabernet hover:text-wheat dark:bg-wheat dark:text-[#141414] dark:hover:bg-white focus-visible:bg-cabernet focus-visible:text-wheat focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cabernet dark:focus-visible:outline-wheat disabled:cursor-not-allowed disabled:opacity-50"
          >
            {status === "submitting" ? "Submitting" : "Submit for review"}
          </button>
          {message ? (
            <p aria-live="polite" className={`text-sm ${status === "error" ? "text-cabernet dark:text-[#e4a3ab]" : "text-navy/70 dark:text-wheat/70"}`}>
              {message}
            </p>
          ) : null}
        </div>
      </div>
    </form>
  );
}
