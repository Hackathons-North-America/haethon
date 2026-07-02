"use client";

import { FormEvent, useState } from "react";
import { Building2, Send, UsersRound } from "lucide-react";

type SubmitterType = "organizer" | "community";

const inputClassName =
  "w-full rounded-lg border-0 bg-[#D2D2D2] px-3 py-2.5 text-sm text-[#181818] outline-none transition placeholder:text-[#747474] focus:bg-[#C8C8C8]";
const labelClassName = "mb-1.5 block text-sm font-semibold text-[#222222]";

function fieldValue(formData: FormData, name: string) {
  return formData.get(name)?.toString() ?? "";
}

function optionalNumber(formData: FormData, name: string) {
  const value = fieldValue(formData, name);

  return value ? Number(value) : "";
}

export function HackathonSubmissionForm() {
  const [submitterType, setSubmitterType] = useState<SubmitterType>("community");
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("submitting");
    setMessage(null);

    const formData = new FormData(event.currentTarget);
    const commonPayload = {
      submitterType,
      name: fieldValue(formData, "name"),
      startDate: fieldValue(formData, "startDate"),
      endDate: fieldValue(formData, "endDate"),
      format: fieldValue(formData, "format"),
      country: fieldValue(formData, "country"),
      city: fieldValue(formData, "city"),
      region: fieldValue(formData, "region"),
      applicationUrl: fieldValue(formData, "applicationUrl"),
      shortDescription: fieldValue(formData, "shortDescription"),
    };
    const payload =
      submitterType === "organizer"
        ? {
            ...commonPayload,
            organizationName: fieldValue(formData, "organizationName"),
            websiteUrl: fieldValue(formData, "websiteUrl"),
            applicationOpensAt: fieldValue(formData, "applicationOpensAt"),
            applicationClosesAt: fieldValue(formData, "applicationClosesAt"),
            acceptanceAt: fieldValue(formData, "acceptanceAt"),
            submissionDeadlineAt: fieldValue(formData, "submissionDeadlineAt"),
            venue: fieldValue(formData, "venue"),
            discordUrl: fieldValue(formData, "discordUrl"),
            devpostUrl: fieldValue(formData, "devpostUrl"),
            eligibility: fieldValue(formData, "eligibility"),
            beginnerFriendly: formData.get("beginnerFriendly") === "on",
            travelReimbursement: formData.get("travelReimbursement") === "on",
            prizeAmountUsd: optionalNumber(formData, "prizeAmountUsd"),
          }
        : {
            ...commonPayload,
            sourceUrl: fieldValue(formData, "sourceUrl"),
            websiteUrl: fieldValue(formData, "websiteUrl"),
            timeNote: fieldValue(formData, "timeNote"),
          };

    const response = await fetch("/api/hackathon-submissions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = (await response.json()) as { error?: unknown; data?: { publishedDirectly?: boolean } };

    if (!response.ok) {
      setStatus("error");
      setMessage(typeof body.error === "string" ? body.error : "Check the highlighted details and try again.");
      return;
    }

    setStatus("success");
    setMessage(body.data?.publishedDirectly ? "Published directly for your verified organization." : "Submitted for review.");
    event.currentTarget.reset();
  }

  return (
    <form onSubmit={onSubmit} className="overflow-hidden rounded-lg border border-black/10 bg-[#EFEFEF] text-[#181818] shadow-sm">
      <div className="border-b border-black/10 bg-[#DCDCDC]">
        <div className="flex" role="tablist" aria-label="Submission type">
          {[
            {
              value: "community" as const,
              label: "Community",
              Icon: UsersRound,
            },
            {
              value: "organizer" as const,
              label: "Organizer",
              Icon: Building2,
            },
          ].map(({ value, label, Icon }) => (
            <button
              aria-selected={submitterType === value}
              className={`inline-flex min-h-14 flex-1 items-center justify-center gap-2 border-b-2 px-4 text-sm font-semibold outline-none transition ${
                submitterType === value
                  ? "border-[#666666] bg-[#EFEFEF] text-[#181818]"
                  : "border-transparent text-[#666666] hover:bg-[#D4D4D4] hover:text-[#222222]"
              }`}
              key={value}
              onClick={() => setSubmitterType(value)}
              role="tab"
              type="button"
            >
              <Icon aria-hidden="true" className="size-4 text-[#5F5F5F]" />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-8 p-6">
        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <label className={labelClassName} htmlFor="name">
              Event name
            </label>
            <input id="name" name="name" required className={inputClassName} />
          </div>
          {submitterType === "organizer" ? (
            <div>
              <label className={labelClassName} htmlFor="organizationName">
                Organization
              </label>
              <input id="organizationName" name="organizationName" required className={inputClassName} />
            </div>
          ) : (
            <div>
              <label className={labelClassName} htmlFor="sourceUrl">
                Website or source URL
              </label>
              <input id="sourceUrl" name="sourceUrl" required type="url" className={inputClassName} />
            </div>
          )}
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          {submitterType === "organizer" ? (
            <div>
              <label className={labelClassName} htmlFor="websiteUrl">
                Website URL
              </label>
              <input id="websiteUrl" name="websiteUrl" required type="url" className={inputClassName} />
            </div>
          ) : (
            <div>
              <label className={labelClassName} htmlFor="websiteUrl">
                Official website if known
              </label>
              <input id="websiteUrl" name="websiteUrl" type="url" className={inputClassName} />
            </div>
          )}
          <div>
            <label className={labelClassName} htmlFor="applicationUrl">
              Application URL
            </label>
            <input id="applicationUrl" name="applicationUrl" type="url" className={inputClassName} />
          </div>
        </div>

        <div className="grid gap-5 md:grid-cols-4">
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
              <option value="hybrid">Hybrid</option>
            </select>
          </div>
          <div>
            <label className={labelClassName} htmlFor="country">
              Country
            </label>
            <input id="country" name="country" required defaultValue="Canada" className={inputClassName} />
          </div>
        </div>

        <div className="grid gap-5 md:grid-cols-3">
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
          {submitterType === "community" ? (
            <div>
              <label className={labelClassName} htmlFor="timeNote">
                Time note
              </label>
              <input id="timeNote" name="timeNote" placeholder="e.g. starts at 9 AM ET" className={inputClassName} />
            </div>
          ) : (
            <div>
              <label className={labelClassName} htmlFor="venue">
                Venue
              </label>
              <input id="venue" name="venue" className={inputClassName} />
            </div>
          )}
        </div>

        {submitterType === "organizer" ? (
          <div className="grid gap-5 border-t border-black/10 pt-6 md:grid-cols-2">
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
              <label className={labelClassName} htmlFor="acceptanceAt">
                Acceptance date
              </label>
              <input id="acceptanceAt" name="acceptanceAt" type="date" className={inputClassName} />
            </div>
            <div>
              <label className={labelClassName} htmlFor="submissionDeadlineAt">
                Submission deadline
              </label>
              <input id="submissionDeadlineAt" name="submissionDeadlineAt" type="date" className={inputClassName} />
            </div>
            <div>
              <label className={labelClassName} htmlFor="discordUrl">
                Discord URL
              </label>
              <input id="discordUrl" name="discordUrl" type="url" className={inputClassName} />
            </div>
            <div>
              <label className={labelClassName} htmlFor="devpostUrl">
                Devpost URL
              </label>
              <input id="devpostUrl" name="devpostUrl" type="url" className={inputClassName} />
            </div>
            <div>
              <label className={labelClassName} htmlFor="prizeAmountUsd">
                Prize amount USD
              </label>
              <input id="prizeAmountUsd" name="prizeAmountUsd" min="0" type="number" className={inputClassName} />
            </div>
            <div className="flex items-end gap-5 pb-2">
              <label className="inline-flex items-center gap-2 text-sm font-semibold text-[#222222]">
                <input name="beginnerFriendly" type="checkbox" className="size-4 accent-[#555555]" />
                Beginner friendly
              </label>
              <label className="inline-flex items-center gap-2 text-sm font-semibold text-[#222222]">
                <input name="travelReimbursement" type="checkbox" className="size-4 accent-[#555555]" />
                Travel reimbursement
              </label>
            </div>
            <div className="md:col-span-2">
              <label className={labelClassName} htmlFor="eligibility">
                Eligibility
              </label>
              <textarea id="eligibility" name="eligibility" rows={3} className={inputClassName} />
            </div>
          </div>
        ) : null}

        <div>
          <label className={labelClassName} htmlFor="shortDescription">
            {submitterType === "organizer" ? "Short description" : "Short note if known"}
          </label>
          <textarea
            id="shortDescription"
            name="shortDescription"
            required={submitterType === "organizer"}
            rows={4}
            className={inputClassName}
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            disabled={status === "submitting"}
            type="submit"
            className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#4A4A4A] px-5 text-sm font-semibold text-white transition hover:bg-[#3A3A3A] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Send aria-hidden="true" className="size-4" />
            {status === "submitting" ? "Submitting" : "Submit for review"}
          </button>
          {message ? (
            <p className={`text-sm font-semibold ${status === "error" ? "text-[#3F3F3F]" : "text-[#555555]"}`}>{message}</p>
          ) : null}
        </div>
      </div>
    </form>
  );
}
