"use client";

import { type FormEvent, type ReactNode, useEffect, useId, useState } from "react";
import { ChevronDown, CircleAlert, CircleCheck, Eye, LoaderCircle, RotateCcw } from "lucide-react";

import { previewPayloadToCard } from "@/components/admin/hackathon-card-preview";
import { HackathonCard } from "@/components/hackathon-card";
import { trackEvent } from "@/lib/analytics/events";
import { dateToInputValue } from "@/lib/hackathons/utils";

import {
  apiErrorMessage,
  cardClassName,
  checkboxClassName,
  compactPrimaryButtonClassName,
  compactSecondaryButtonClassName,
  focusRingClassName,
  inputClassName,
  labelClassName,
  type OrganizerHackathonItem,
} from "./shared";

/* The editable fields, keyed exactly as the PATCH payload expects them. Dates
   are `YYYY-MM-DD` strings from <input type="date">, prize is the raw input
   string (the API coerces "" to "no prize"). */
type FormValues = {
  name: string;
  shortDescription: string;
  websiteUrl: string;
  imageUrl: string;
  applicationUrl: string;
  venue: string;
  city: string;
  region: string;
  country: string;
  startDate: string;
  endDate: string;
  applicationOpensAt: string;
  applicationClosesAt: string;
  acceptanceAt: string;
  format: OrganizerHackathonItem["format"];
  beginnerFriendly: boolean;
  travelReimbursement: boolean;
  highSchoolersOnly: boolean;
  prizeAmountUsd: string;
  discordTag: string;
};

type FieldName = keyof FormValues;
type FieldErrors = Partial<Record<FieldName, string>>;
type SaveResult = { data?: OrganizerHackathonItem; error?: unknown };
type Feedback = { tone: "error" | "success"; text: string } | null;

const SAVE_FALLBACK_ERROR = "Could not save changes. Check the required fields.";
const DESCRIPTION_MAX = 500;
const SUCCESS_FADE_MS = 4000;

function itemToValues(item: OrganizerHackathonItem): FormValues {
  return {
    name: item.name,
    shortDescription: item.shortDescription ?? "",
    websiteUrl: item.websiteUrl ?? "",
    imageUrl: item.imageUrl ?? "",
    applicationUrl: item.applicationUrl ?? "",
    venue: item.venue ?? "",
    city: item.city ?? "",
    region: item.region ?? "",
    country: item.country ?? "",
    startDate: dateToInputValue(item.startsAt),
    endDate: dateToInputValue(item.endsAt),
    applicationOpensAt: dateToInputValue(item.applicationOpensAt),
    applicationClosesAt: dateToInputValue(item.applicationClosesAt),
    acceptanceAt: dateToInputValue(item.acceptanceAt),
    format: item.format,
    beginnerFriendly: item.beginnerFriendly,
    travelReimbursement: item.travelReimbursement,
    highSchoolersOnly: item.highSchoolersOnly,
    prizeAmountUsd: item.prizeAmountUsd == null ? "" : String(item.prizeAmountUsd),
    discordTag: item.discordTag ?? "",
  };
}

function valuesEqual(a: FormValues, b: FormValues) {
  return (Object.keys(a) as FieldName[]).every((key) => a[key] === b[key]);
}

/* The API answers a schema failure with zod's `flatten()` shape
   ({ formErrors, fieldErrors }); keep the first message per known field. */
function parseFieldErrors(error: unknown, values: FormValues): FieldErrors {
  if (!error || typeof error !== "object" || !("fieldErrors" in error)) {
    return {};
  }

  const fieldErrors = (error as { fieldErrors?: Record<string, unknown> }).fieldErrors ?? {};
  const parsed: FieldErrors = {};

  for (const [key, messages] of Object.entries(fieldErrors)) {
    if (key in values && Array.isArray(messages) && typeof messages[0] === "string") {
      parsed[key as FieldName] = messages[0];
    }
  }

  return parsed;
}

function formErrorMessage(error: unknown) {
  if (error && typeof error === "object" && "formErrors" in error) {
    const formErrors = (error as { formErrors?: unknown }).formErrors;

    if (Array.isArray(formErrors) && typeof formErrors[0] === "string") {
      return formErrors[0];
    }
  }

  return null;
}

/* Helper text under each field. Fields with a hint are described by it. */
const HINTS: Partial<Record<FieldName, string>> = {
  name: "3 to 180 characters.",
  shortDescription: "One or two sentences about the event.",
  endDate: "Same day as the start for one-day events.",
  venue: "Building or campus, if in person.",
  region: "State or province.",
  applicationUrl: "Where hackers sign up, if different from the website.",
  prizeAmountUsd: "Whole dollars. Leave blank if there are no prizes.",
  websiteUrl: "The card links here. Must start with http:// or https://.",
  imageUrl: "A direct link to an image. Check the preview to see how it crops.",
  discordTag: "A Discord username hackers can message with questions. Leave blank to hide it.",
};

/* Field order on the page; the first errored field gets focus after a failed save. */
const FIELD_ORDER: FieldName[] = [
  "name",
  "shortDescription",
  "startDate",
  "endDate",
  "format",
  "venue",
  "city",
  "region",
  "country",
  "applicationUrl",
  "applicationOpensAt",
  "applicationClosesAt",
  "acceptanceAt",
  "beginnerFriendly",
  "travelReimbursement",
  "highSchoolersOnly",
  "prizeAmountUsd",
  "websiteUrl",
  "imageUrl",
  "discordTag",
];

export function DetailsTab({
  item,
  onSaved,
}: {
  item: OrganizerHackathonItem;
  onSaved: (next: OrganizerHackathonItem) => void;
}) {
  const idPrefix = useId();
  const [baseline, setBaseline] = useState<FormValues>(() => itemToValues(item));
  const [values, setValues] = useState<FormValues>(baseline);
  const [syncedItem, setSyncedItem] = useState(item);
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [feedback, setFeedback] = useState<Feedback>(null);

  const dirty = !valuesEqual(values, baseline);

  /* Adopt a new item from the parent (another hackathon, or a refreshed copy)
     without clobbering edits in progress on the same one. */
  if (item !== syncedItem) {
    setSyncedItem(item);

    if (item.id !== syncedItem.id || !dirty) {
      const next = itemToValues(item);
      setBaseline(next);
      setValues(next);
      setFieldErrors({});

      if (item.id !== syncedItem.id) {
        setFeedback(null);
      }
    }
  }

  useEffect(() => {
    if (!dirty) {
      return;
    }

    function warnBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      // Older browsers only prompt when returnValue is set.
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", warnBeforeUnload);

    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [dirty]);

  /* "Changes saved." fades on its own; errors stay until the next edit or save. */
  useEffect(() => {
    if (feedback?.tone !== "success") {
      return;
    }

    const timer = window.setTimeout(() => {
      setFeedback((current) => (current === feedback ? null : current));
    }, SUCCESS_FADE_MS);

    return () => window.clearTimeout(timer);
  }, [feedback]);

  /* The save bar only appears when there's something to act on or report. */
  const showSaveBar = dirty || saving || feedback !== null;
  const statusMessage = saving
    ? "Saving changes..."
    : feedback?.tone === "error"
      ? feedback.text
      : dirty
        ? "Unsaved changes"
        : (feedback?.text ?? "");

  const fieldId = (name: FieldName) => `${idPrefix}-${name}`;

  function setField<K extends FieldName>(name: K, value: FormValues[K]) {
    setValues((current) => ({ ...current, [name]: value }));
    // Any edit supersedes the last save's outcome; per-field errors stay until fixed.
    setFeedback(null);

    if (fieldErrors[name]) {
      setFieldErrors((current) => {
        const next = { ...current };
        delete next[name];
        return next;
      });
    }
  }

  function focusFirstError(errors: FieldErrors) {
    const first = FIELD_ORDER.find((name) => errors[name]);

    if (first) {
      // Wait a frame so aria-invalid has rendered before focus lands.
      requestAnimationFrame(() => document.getElementById(fieldId(first))?.focus());
    }
  }

  function discardChanges() {
    setValues(baseline);
    setFieldErrors({});
    // Confirms the reset (and keeps the bar up briefly rather than vanishing under the pointer).
    setFeedback({ tone: "success", text: "Changes discarded." });
  }

  async function saveChanges(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!dirty || saving) {
      return;
    }

    // Mirrors the API's date-range rule so the common mistake is caught inline.
    if (values.startDate && values.endDate && values.endDate < values.startDate) {
      const errors = { endDate: "End date must be on or after the start date." };
      setFieldErrors(errors);
      setFeedback({ tone: "error", text: "Fix the highlighted field before saving." });
      focusFirstError(errors);
      return;
    }

    setSaving(true);
    setFeedback(null);
    setFieldErrors({});

    let response: Response;
    let result: SaveResult | null;

    try {
      response = await fetch(`/api/organizer/hackathons/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      result = (await response.json().catch(() => null)) as SaveResult | null;
    } catch {
      setSaving(false);
      setFeedback({ tone: "error", text: "Could not reach the server. Check your connection and try again." });
      return;
    }

    setSaving(false);

    if (!response.ok || !result?.data) {
      const errors = parseFieldErrors(result?.error, values);
      const hasFieldErrors = Object.keys(errors).length > 0;

      setFieldErrors(errors);
      setFeedback({
        tone: "error",
        text: hasFieldErrors
          ? "Fix the highlighted fields before saving."
          : (formErrorMessage(result?.error) ?? apiErrorMessage(result, SAVE_FALLBACK_ERROR)),
      });
      focusFirstError(errors);
      return;
    }

    const saved = result.data;
    const next = itemToValues(saved);

    setBaseline(next);
    setValues(next);
    setSyncedItem(saved);
    setFeedback({ tone: "success", text: "Changes saved." });
    trackEvent("organizer_hackathon_updated", {
      hackathon_id: saved.id,
      hackathon_name: saved.name,
      format: saved.format,
      status: saved.status,
    });
    onSaved(saved);
  }

  /* Props shared by every text-like input: value binding, ids and a11y wiring. */
  function textProps(name: Exclude<FieldName, "format" | "beginnerFriendly" | "travelReimbursement" | "highSchoolersOnly">) {
    const error = fieldErrors[name];

    return {
      id: fieldId(name),
      name,
      value: values[name],
      onChange: (event: { target: { value: string } }) => setField(name, event.target.value),
      className: inputClassName,
      "aria-invalid": error ? true : undefined,
      "aria-describedby": describedBy(name),
    };
  }

  function describedBy(name: FieldName) {
    const ids = [fieldErrors[name] ? `${fieldId(name)}-error` : null, HINTS[name] ? `${fieldId(name)}-hint` : null];
    return ids.filter(Boolean).join(" ") || undefined;
  }

  function fieldShell(name: FieldName, label: string, control: ReactNode, options: { extra?: ReactNode; required?: boolean; className?: string } = {}) {
    const error = fieldErrors[name];
    const hint = HINTS[name];

    return (
      <div className={options.className}>
        <label className={labelClassName} htmlFor={fieldId(name)}>
          {label}
          {options.required ? (
            <>
              <span aria-hidden="true" className="ml-0.5 text-danger">
                *
              </span>
              <span className="sr-only"> (required)</span>
            </>
          ) : null}
        </label>
        {control}
        {error ? (
          <p className="mt-1.5 flex items-start gap-1.5 text-xs font-medium text-danger" id={`${fieldId(name)}-error`}>
            <CircleAlert aria-hidden="true" className="mt-px size-3.5 shrink-0" />
            {error}
          </p>
        ) : null}
        {hint || options.extra ? (
          <div className="mt-1.5 flex justify-between gap-3 text-xs leading-5 text-ink/55">
            {hint ? <p id={`${fieldId(name)}-hint`}>{hint}</p> : null}
            {options.extra}
          </div>
        ) : null}
      </div>
    );
  }

  const preview = (
    <HackathonCard hackathon={previewPayloadToCard(values as unknown as Record<string, unknown>, item.id)} preview />
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_22rem]">
      {/* Mobile and tablet: the preview folds away above the form. */}
      <details className={`group ${cardClassName} lg:hidden`}>
        <summary
          className={`flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-4 py-3 text-sm font-semibold text-ink [&::-webkit-details-marker]:hidden ${focusRingClassName}`}
        >
          <span className="flex items-center gap-2">
            <Eye aria-hidden="true" className="size-4 text-pine" />
            Live preview
          </span>
          <ChevronDown aria-hidden="true" className="size-4 text-ink/55 transition-transform group-open:rotate-180" />
        </summary>
        <div className="border-t border-ink/10 p-4">{preview}</div>
      </details>

      <form className="min-w-0 space-y-5" onSubmit={saveChanges}>
        <Section description="What hackers see first on the card and the listing." title="Basics">
          <div className="grid gap-4">
            {fieldShell(
              "name",
              "Event name",
              <input {...textProps("name")} autoComplete="off" maxLength={180} minLength={3} required />,
              { required: true }
            )}
            {fieldShell(
              "shortDescription",
              "Short description",
              <textarea {...textProps("shortDescription")} maxLength={DESCRIPTION_MAX} rows={4} />,
              {
                extra: (
                  <span aria-hidden="true" className="shrink-0 tabular-nums">
                    {values.shortDescription.length}/{DESCRIPTION_MAX}
                  </span>
                ),
              }
            )}
          </div>
        </Section>

        <Section description="When it runs, and where hackers show up." title="Dates & location">
          <div className="grid gap-4 sm:grid-cols-2">
            {fieldShell("startDate", "Start date", <input {...textProps("startDate")} required type="date" />, {
              required: true,
            })}
            {fieldShell(
              "endDate",
              "End date",
              <input {...textProps("endDate")} min={values.startDate || undefined} required type="date" />,
              { required: true }
            )}

            <fieldset className="sm:col-span-2">
              <legend className={labelClassName}>Format</legend>
              <div className="grid grid-cols-2 gap-2" id={fieldId("format")} tabIndex={-1}>
                {(
                  [
                    ["in_person", "In person"],
                    ["online", "Online"],
                  ] as const
                ).map(([value, label]) => (
                  <label
                    className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-ink/15 bg-paper px-3 text-sm font-semibold text-ink transition-colors has-checked:border-pine has-checked:bg-pine-soft has-checked:text-pine has-focus-visible:ring-2 has-focus-visible:ring-pine/40"
                    key={value}
                  >
                    <input
                      checked={values.format === value}
                      className="sr-only"
                      name="format"
                      onChange={() => setField("format", value)}
                      type="radio"
                      value={value}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>

            {fieldShell("venue", "Venue", <input {...textProps("venue")} autoComplete="off" maxLength={160} />, {
              className: "sm:col-span-2",
            })}
            {fieldShell("city", "City", <input {...textProps("city")} autoComplete="address-level2" maxLength={120} />)}
            {fieldShell(
              "region",
              "Region",
              <input {...textProps("region")} autoComplete="address-level1" maxLength={120} />
            )}
            {fieldShell(
              "country",
              "Country",
              <input {...textProps("country")} autoComplete="country-name" maxLength={120} minLength={2} required />,
              { required: true, className: "sm:col-span-2" }
            )}
          </div>
        </Section>

        <Section description="Where and when hackers apply. Leave dates blank if they don't apply." title="Applications">
          <div className="grid gap-4 sm:grid-cols-3">
            {fieldShell(
              "applicationUrl",
              "Application link",
              <input {...textProps("applicationUrl")} inputMode="url" placeholder="https://" type="url" />,
              { className: "sm:col-span-3" }
            )}
            {fieldShell("applicationOpensAt", "Applications open", <input {...textProps("applicationOpensAt")} type="date" />)}
            {fieldShell(
              "applicationClosesAt",
              "Applications close",
              <input {...textProps("applicationClosesAt")} type="date" />
            )}
            {fieldShell("acceptanceAt", "Acceptances out", <input {...textProps("acceptanceAt")} type="date" />)}
          </div>
        </Section>

        <Section description="Who it's for and what's on offer. These show as badges on the card." title="Perks & eligibility">
          <div className="grid gap-2">
            {(
              [
                ["beginnerFriendly", "Beginner friendly", "Welcoming to first-time hackers."],
                ["travelReimbursement", "Travel support", "Some travel costs are reimbursed."],
                ["highSchoolersOnly", "High schoolers only", "Only high school students can attend."],
              ] as const
            ).map(([name, label, hint]) => (
              <label
                className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-ink/10 bg-paper px-3 py-2.5 transition-colors hover:border-ink/20 has-focus-visible:ring-2 has-focus-visible:ring-pine/40"
                htmlFor={fieldId(name)}
                key={name}
              >
                <input
                  checked={values[name]}
                  className={`${checkboxClassName} mt-0.5`}
                  id={fieldId(name)}
                  name={name}
                  onChange={(event) => setField(name, event.target.checked)}
                  type="checkbox"
                />
                <span>
                  <span className="block text-sm font-semibold text-ink">{label}</span>
                  <span className="block text-xs leading-5 text-ink/55">{hint}</span>
                </span>
              </label>
            ))}
          </div>
          <div className="mt-4 sm:max-w-xs">
            {fieldShell(
              "prizeAmountUsd",
              "Prize pool (USD)",
              <input {...textProps("prizeAmountUsd")} inputMode="numeric" min={0} placeholder="0" step={1} type="number" />
            )}
          </div>
        </Section>

        <Section description="Where the card links, its cover image, and who hackers can ping." title="Links & media">
          <div className="grid gap-4">
            {fieldShell(
              "websiteUrl",
              "Website",
              <input {...textProps("websiteUrl")} inputMode="url" placeholder="https://" required type="url" />,
              { required: true }
            )}
            {fieldShell(
              "imageUrl",
              "Cover image URL",
              <input {...textProps("imageUrl")} inputMode="url" placeholder="https://" type="url" />
            )}
            {fieldShell(
              "discordTag",
              "Organizer Discord",
              <input
                {...textProps("discordTag")}
                autoCapitalize="none"
                autoComplete="off"
                maxLength={33}
                placeholder="Organizer to ping"
                spellCheck={false}
              />
            )}
          </div>
        </Section>

        {/* Always mounted so status changes are announced even while the bar is hidden. */}
        <p aria-live="polite" className="sr-only" role="status">
          {statusMessage}
        </p>

        {/* Save bar: sticks to the bottom of the viewport while the form scrolls,
            shown only while there's something to save or report. One row on every size. */}
        {showSaveBar ? (
          <div className="sticky bottom-0 z-10 -mx-1 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2">
            <div
              className={`${cardClassName} flex items-center gap-2 px-3 py-2 shadow-lg shadow-ink/5 sm:gap-3 sm:px-4 sm:py-3`}
            >
              <p aria-hidden="true" className="flex min-w-0 flex-1 items-center gap-2 text-sm font-medium">
                {saving ? (
                  <>
                    <LoaderCircle className="size-4 shrink-0 animate-spin text-ink/55" />
                    <span className="truncate text-ink/70">Saving changes...</span>
                  </>
                ) : feedback?.tone === "error" ? (
                  <>
                    <CircleAlert className="size-4 shrink-0 text-danger" />
                    <span className="line-clamp-2 text-danger sm:truncate">{feedback.text}</span>
                  </>
                ) : dirty ? (
                  <>
                    <span className="size-2 shrink-0 rounded-full bg-warning" />
                    <span className="truncate text-ink">Unsaved changes</span>
                  </>
                ) : feedback?.tone === "success" ? (
                  <>
                    <CircleCheck className="size-4 shrink-0 text-success" />
                    <span className="truncate text-success">{feedback.text}</span>
                  </>
                ) : null}
              </p>
              <div className="flex shrink-0 gap-2">
                <button
                  className={compactSecondaryButtonClassName}
                  disabled={!dirty || saving}
                  onClick={discardChanges}
                  type="button"
                >
                  <RotateCcw aria-hidden="true" className="hidden size-4 sm:block" />
                  Discard
                </button>
                <button className={compactPrimaryButtonClassName} disabled={!dirty || saving} type="submit">
                  {saving ? (
                    "Saving..."
                  ) : (
                    <>
                      Save<span className="hidden sm:inline">&nbsp;changes</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </form>

      {/* Desktop: the preview rides alongside the form. */}
      <aside aria-label="Live preview" className="hidden lg:block">
        <div className="sticky top-6 space-y-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-ink">
            <Eye aria-hidden="true" className="size-4 text-pine" />
            Live preview
          </p>
          {preview}
          <p className="text-xs leading-5 text-ink/55">Updates as you type. Nothing is public until you save.</p>
        </div>
      </aside>
    </div>
  );
}

function Section({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  const headingId = useId();

  return (
    <section aria-labelledby={headingId} className={`${cardClassName} p-4 sm:p-5`}>
      <div className="mb-4">
        <h2 className="text-base font-semibold text-ink" id={headingId}>
          {title}
        </h2>
        <p className="mt-0.5 text-sm text-ink/55">{description}</p>
      </div>
      {children}
    </section>
  );
}
