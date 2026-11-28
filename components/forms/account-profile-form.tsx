"use client";

import { type FormEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { AlertCircle, Loader2, Save } from "lucide-react";

import {
  cardClassName,
  eyebrowClassName,
  primaryButtonClassName,
  secondaryButtonClassName,
} from "@/components/account/account-styles";
import { SkillsField } from "@/components/forms/skills-field";
import { sanitizeSkills } from "@/lib/profile/skills";
import { containsProfanity } from "@/lib/validations/profanity";
import {
  SOCIAL_PLATFORMS,
  parsePortfolioUrl,
  parseSocialInput,
  type SocialPlatformKey,
} from "@/lib/validations/social";

export type AccountProfileValues = {
  firstName?: string | null;
  lastName?: string | null;
  headline?: string | null;
  bio?: string | null;
  locationCity?: string | null;
  locationRegion?: string | null;
  school?: string | null;
  githubUrl?: string | null;
  linkedinUrl?: string | null;
  instagramUrl?: string | null;
  xUrl?: string | null;
  devpostUrl?: string | null;
  portfolioUrl?: string | null;
  skills?: string[] | null;
};

type TextFieldName = "firstName" | "lastName" | "headline" | "bio" | "locationCity" | "locationRegion" | "school";

type AccountProfileFormProps = {
  /** Current saved values; the form copies them when it mounts. */
  values: AccountProfileValues;
  onCancel: () => void;
  /** Called once the server accepted the save. The parent leaves edit mode. */
  onSaved: () => void;
  /**
   * Rendered after the form's cards, outside the <form> element: the Devpost
   * import dialog contains a form of its own and saves independently.
   */
  devpostCard?: ReactNode;
};

const FORM_ID = "account-profile-form";

const PROFANITY_MESSAGE = "Please remove the inappropriate language.";
const BIO_MAX_LENGTH = 2000;
// Résumé order: the links people click most come first.
const SOCIAL_FIELDS: SocialPlatformKey[] = ["githubUrl", "linkedinUrl", "devpostUrl", "xUrl", "instagramUrl"];
// Visual order, used to focus the first invalid field.
const FIELD_ORDER = [
  "firstName",
  "lastName",
  "school",
  "bio",
  "headline",
  "locationCity",
  "locationRegion",
  ...SOCIAL_FIELDS,
  "portfolioUrl",
  "skills",
];

const inputBaseClassName =
  "min-h-11 w-full rounded-xl border bg-paper px-3 py-2 text-sm text-ink outline-none transition placeholder:text-ink/40 focus:ring-2";
const inputOkClassName = "border-ink/15 focus:border-pine focus:ring-pine/15";
const inputErrorClassName = "border-danger focus:border-danger focus:ring-danger/15";
const prefixGroupBaseClassName =
  "flex min-h-11 w-full items-stretch overflow-hidden rounded-xl border bg-paper transition focus-within:ring-2";
const prefixGroupOkClassName = "border-ink/15 focus-within:border-pine focus-within:ring-pine/15";
const prefixGroupErrorClassName = "border-danger focus-within:border-danger focus-within:ring-danger/15";

function fieldId(name: string) {
  return `profile-${name}`;
}

function inputClassName(hasError: boolean) {
  return `${inputBaseClassName} ${hasError ? inputErrorClassName : inputOkClassName}`;
}

function formValue(formData: FormData, name: TextFieldName) {
  return formData.get(name)?.toString() ?? "";
}

// The edit form shows just the handle; stored values are canonical URLs.
// Legacy values that don't parse are kept verbatim so the user can fix them.
function handleFromStored(platform: SocialPlatformKey, url: string | null | undefined) {
  if (!url) {
    return "";
  }

  const parsed = parseSocialInput(platform, url);
  return parsed.ok ? parsed.handle : url;
}

function draftsFromValues(values: AccountProfileValues) {
  return {
    linkedinUrl: handleFromStored("linkedinUrl", values.linkedinUrl),
    instagramUrl: handleFromStored("instagramUrl", values.instagramUrl),
    xUrl: handleFromStored("xUrl", values.xUrl),
    devpostUrl: handleFromStored("devpostUrl", values.devpostUrl),
    githubUrl: handleFromStored("githubUrl", values.githubUrl),
    portfolioUrl: values.portfolioUrl ?? "",
  };
}

type SocialDrafts = ReturnType<typeof draftsFromValues>;

type SaveStatus =
  | { kind: "idle" }
  | { kind: "saving" }
  /** Field-level problems; cleared once every highlighted field is fixed. */
  | { kind: "invalid"; message: string }
  | { kind: "error"; message: string };

/**
 * One labelled control: label, optional hint, and an inline error that is
 * wired to the control through aria-describedby.
 */
function Field({
  name,
  label,
  hint,
  error,
  className,
  labelAside,
  children,
}: {
  name: string;
  label: string;
  hint?: ReactNode;
  error?: string;
  className?: string;
  labelAside?: ReactNode;
  children: (aria: { id: string; "aria-describedby"?: string; "aria-invalid"?: true }) => ReactNode;
}) {
  const id = fieldId(name);
  const hintId = hint ? `${id}-hint` : null;
  const errorId = error ? `${id}-error` : null;
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={`min-w-0 ${className ?? ""}`}>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <label className="text-sm font-medium text-ink" htmlFor={id}>
          {label}
        </label>
        {labelAside}
      </div>
      {children({ id, "aria-describedby": describedBy, ...(error ? { "aria-invalid": true as const } : {}) })}
      {error ? (
        <p className="mt-1.5 flex items-start gap-1.5 text-xs font-medium text-danger" id={errorId ?? undefined}>
          <AlertCircle aria-hidden="true" className="mt-px size-3.5 shrink-0" />
          {error}
        </p>
      ) : null}
      {hint ? (
        <p className="mt-1.5 text-xs text-ink/55" id={hintId ?? undefined}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function FormCard({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  const titleId = `${id}-title`;

  return (
    <section aria-labelledby={titleId} className={`${cardClassName} p-4 sm:p-5`}>
      <h2 className="text-base font-semibold tracking-tight text-ink" id={titleId}>
        {title}
      </h2>
      <p className="mt-0.5 text-sm text-ink/55">{description}</p>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function AccountProfileForm({ values, onCancel, onSaved, devpostCard }: AccountProfileFormProps) {
  const [status, setStatus] = useState<SaveStatus>({ kind: "idle" });
  const [socialDrafts, setSocialDrafts] = useState<SocialDrafts>(() => draftsFromValues(values));
  const [skillsDraft, setSkillsDraft] = useState<string[]>(() => sanitizeSkills(values.skills ?? []));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [bioLength, setBioLength] = useState(() => (values.bio ?? "").length);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const saving = status.kind === "saving";

  // A Devpost handle saved from the import dialog while this form is open
  // refreshes `values`; carry it into the draft unless the user already
  // typed a different one, so saving the form doesn't wipe it.
  const [syncedDevpostUrl, setSyncedDevpostUrl] = useState(values.devpostUrl ?? null);

  if ((values.devpostUrl ?? null) !== syncedDevpostUrl) {
    const previousHandle = handleFromStored("devpostUrl", syncedDevpostUrl);
    setSyncedDevpostUrl(values.devpostUrl ?? null);
    setSocialDrafts((drafts) =>
      drafts.devpostUrl === previousHandle
        ? { ...drafts, devpostUrl: handleFromStored("devpostUrl", values.devpostUrl) }
        : drafts
    );
  }

  // Move focus to the form's heading so keyboard and screen-reader users land
  // in the editor (rather than on a field, which pops the phone keyboard).
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  function clearFieldError(name: string) {
    setFieldErrors((errors) => {
      if (!(name in errors)) {
        return errors;
      }

      const next = { ...errors };
      delete next[name];
      return next;
    });
  }

  function focusFirstError(errors: Record<string, string>) {
    const first = FIELD_ORDER.find((name) => name in errors);
    const target = first ? formRef.current?.querySelector<HTMLElement>(`#${fieldId(first)}`) : null;
    target?.focus();
  }

  function onSocialChange(name: SocialPlatformKey, rawValue: string) {
    let next = rawValue;

    // A pasted profile URL is reduced to its handle right away.
    if (/[/:]/.test(rawValue)) {
      const parsed = parseSocialInput(name, rawValue);

      if (parsed.ok) {
        next = parsed.handle;
      }
    }

    setSocialDrafts((drafts) => ({ ...drafts, [name]: next }));
    clearFieldError(name);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (saving) {
      return;
    }

    const formData = new FormData(event.currentTarget);
    const errors: Record<string, string> = {};

    const textPayload = {
      firstName: formValue(formData, "firstName"),
      lastName: formValue(formData, "lastName"),
      headline: formValue(formData, "headline"),
      bio: formValue(formData, "bio"),
      locationCity: formValue(formData, "locationCity"),
      locationRegion: formValue(formData, "locationRegion"),
      school: formValue(formData, "school"),
    };

    for (const name of ["firstName", "lastName", "headline", "bio", "school"] as const) {
      if (containsProfanity(textPayload[name])) {
        errors[name] = PROFANITY_MESSAGE;
      }
    }

    const socialPayload: Record<string, string> = {};

    for (const name of SOCIAL_FIELDS) {
      const raw = socialDrafts[name].trim();

      if (!raw) {
        socialPayload[name] = "";
        continue;
      }

      const parsed = parseSocialInput(name, raw);

      if (!parsed.ok) {
        errors[name] = parsed.error;
        continue;
      }

      if (containsProfanity(parsed.handle)) {
        errors[name] = PROFANITY_MESSAGE;
        continue;
      }

      socialPayload[name] = parsed.url;
    }

    const portfolioRaw = socialDrafts.portfolioUrl.trim();

    if (portfolioRaw) {
      const parsed = parsePortfolioUrl(portfolioRaw);

      if (parsed.ok) {
        socialPayload.portfolioUrl = parsed.url;
      } else {
        errors.portfolioUrl = parsed.error;
      }
    } else {
      socialPayload.portfolioUrl = "";
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setStatus({ kind: "invalid", message: "Fix the highlighted fields to save." });
      focusFirstError(errors);
      return;
    }

    setFieldErrors({});
    setStatus({ kind: "saving" });

    const payload = { ...textPayload, ...socialPayload, skills: sanitizeSkills(skillsDraft) };

    const response = await fetch("/api/account/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => null);

    if (!response) {
      setStatus({ kind: "error", message: "Couldn't reach the server. Check your connection and try again." });
      return;
    }

    if (response.ok) {
      // Stay in the "saving" state: the parent swaps back to the profile view
      // once the refreshed page data has arrived.
      onSaved();
      return;
    }

    // Surface server-side validation errors on the fields they belong to.
    const body = await response.json().catch(() => null);
    const serverErrors = body?.error?.fieldErrors as Record<string, string[]> | undefined;
    const mapped = serverErrors
      ? Object.fromEntries(
          Object.entries(serverErrors)
            .filter(([, messages]) => messages?.length)
            .map(([name, messages]) => [name, messages[0]])
        )
      : {};

    if (Object.keys(mapped).length > 0) {
      setFieldErrors(mapped);
      setStatus({ kind: "invalid", message: "Some fields need attention." });
      focusFirstError(mapped);
      return;
    }

    setStatus({ kind: "error", message: "Couldn't save your profile. Please try again." });
  }

  // Once the last highlighted field is fixed, the form is back to idle; the
  // next submit validates again anyway.
  const currentStatus: SaveStatus =
    status.kind === "invalid" && Object.keys(fieldErrors).length === 0 ? { kind: "idle" } : status;
  // The public profile is a cached page. A save marks it stale
  // (revalidateTag "max": stale-while-revalidate), so the next visit may
  // still get the old copy while it rebuilds; promise "shortly", not "now".
  const statusMessage =
    currentStatus.kind === "saving"
      ? "Saving your profile…"
      : currentStatus.kind === "idle"
        ? "Changes reach your public profile shortly after you save."
        : currentStatus.message;
  const statusIsError = currentStatus.kind === "invalid" || currentStatus.kind === "error";

  function textField(
    name: TextFieldName,
    label: string,
    options: { maxLength: number; hint?: ReactNode; className?: string; autoComplete?: string; placeholder?: string }
  ) {
    return (
      <Field className={options.className} error={fieldErrors[name]} hint={options.hint} label={label} name={name}>
        {(aria) => (
          <input
            {...aria}
            autoComplete={options.autoComplete}
            className={inputClassName(Boolean(fieldErrors[name]))}
            defaultValue={values[name] ?? ""}
            maxLength={options.maxLength}
            name={name}
            onChange={() => clearFieldError(name)}
            placeholder={options.placeholder}
          />
        )}
      </Field>
    );
  }

  return (
    <div>
      <div>
        <p className={eyebrowClassName}>Your profile</p>
        <h1
          className="mt-1 text-2xl font-semibold tracking-tight text-ink outline-none sm:text-3xl"
          id="edit-profile-title"
          ref={headingRef}
          tabIndex={-1}
        >
          Edit profile
        </h1>
      </div>

      <form aria-labelledby="edit-profile-title" className="mt-5 space-y-4" id={FORM_ID} onSubmit={onSubmit} ref={formRef}>
        <FormCard description="Your name, school, and bio lead your public profile." id="profile-basics" title="Basics">
          <div className="grid gap-4 sm:grid-cols-2">
            {textField("firstName", "First name", { maxLength: 80, autoComplete: "given-name" })}
            {textField("lastName", "Last name", { maxLength: 80, autoComplete: "family-name" })}
            {textField("school", "School", {
              maxLength: 160,
              className: "sm:col-span-2",
              placeholder: "University of Waterloo",
            })}
            <Field
              className="sm:col-span-2"
              error={fieldErrors.bio}
              hint="A sentence or two about what you build and what you're looking for."
              label="Bio"
              labelAside={
                <span className="text-xs tabular-nums text-ink/55">
                  {bioLength.toLocaleString("en-US")}/{BIO_MAX_LENGTH.toLocaleString("en-US")}
                </span>
              }
              name="bio"
            >
              {(aria) => (
                <textarea
                  {...aria}
                  className={`${inputClassName(Boolean(fieldErrors.bio))} resize-y leading-relaxed`}
                  defaultValue={values.bio ?? ""}
                  maxLength={BIO_MAX_LENGTH}
                  name="bio"
                  onChange={(event) => {
                    setBioLength(event.target.value.length);
                    clearFieldError("bio");
                  }}
                  rows={4}
                />
              )}
            </Field>
          </div>

          <div className="mt-5 border-t border-ink/10 pt-4">
            <p className="text-sm font-medium text-ink">Headline &amp; location</p>
            <p className="mt-0.5 text-xs text-ink/55">Saved to your account. Not shown on your public profile.</p>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              {textField("headline", "Headline", {
                maxLength: 160,
                className: "sm:col-span-2",
                placeholder: "CS student · building ML tools",
              })}
              {textField("locationCity", "City", { maxLength: 120, autoComplete: "address-level2" })}
              {textField("locationRegion", "Province or state", { maxLength: 120, autoComplete: "address-level1" })}
            </div>
          </div>
        </FormCard>

        <FormCard
          description="Type your username, or paste a full profile link."
          id="profile-links"
          title="Links"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            {SOCIAL_FIELDS.map((name) => {
              const platform = SOCIAL_PLATFORMS[name];
              const error = fieldErrors[name];

              return (
                <Field
                  error={error}
                  hint={
                    name === "devpostUrl"
                      ? "Import your projects and wins with Devpost import below. A different username has to be verified again."
                      : undefined
                  }
                  key={name}
                  label={platform.label}
                  name={name}
                >
                  {(aria) => (
                    <div
                      className={`${prefixGroupBaseClassName} ${error ? prefixGroupErrorClassName : prefixGroupOkClassName}`}
                    >
                      <span
                        aria-hidden="true"
                        className="flex shrink-0 select-none items-center whitespace-nowrap border-r border-ink/10 bg-ink/[0.03] px-3 text-sm text-ink/55"
                      >
                        {platform.prefix}
                      </span>
                      <input
                        {...aria}
                        autoCapitalize="none"
                        autoComplete="off"
                        className="w-full min-w-0 flex-1 bg-transparent px-3 py-2 text-sm text-ink outline-none placeholder:text-ink/40"
                        onChange={(event) => onSocialChange(name, event.target.value)}
                        placeholder="username"
                        spellCheck={false}
                        value={socialDrafts[name]}
                      />
                    </div>
                  )}
                </Field>
              );
            })}
            <Field error={fieldErrors.portfolioUrl} label="Portfolio or website" name="portfolioUrl">
              {(aria) => (
                <input
                  {...aria}
                  autoCapitalize="none"
                  autoComplete="url"
                  className={inputClassName(Boolean(fieldErrors.portfolioUrl))}
                  inputMode="url"
                  onChange={(event) => {
                    const next = event.target.value;
                    setSocialDrafts((drafts) => ({ ...drafts, portfolioUrl: next }));
                    clearFieldError("portfolioUrl");
                  }}
                  placeholder="https://your-site.dev"
                  spellCheck={false}
                  value={socialDrafts.portfolioUrl}
                />
              )}
            </Field>
          </div>
        </FormCard>

        <FormCard
          description="Pick the languages and frameworks you know. Select as many as you like."
          id="profile-skills"
          title="Skills"
        >
          <SkillsField
            onChange={(next) => {
              setSkillsDraft(next);
              clearFieldError("skills");
            }}
            value={skillsDraft}
          />
          {fieldErrors.skills ? (
            <p className="mt-2 flex items-start gap-1.5 text-xs font-medium text-danger" id={fieldId("skills")} tabIndex={-1}>
              <AlertCircle aria-hidden="true" className="mt-px size-3.5 shrink-0" />
              {fieldErrors.skills}
            </p>
          ) : null}
        </FormCard>
      </form>

      {devpostCard ? <div className="mt-4">{devpostCard}</div> : null}

      {/* Floats above the phone tab bar (3.5rem + home indicator) and just
          above the viewport edge on desktop, so Save is always in reach. */}
      <div className="sticky bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-20 mt-4 lg:bottom-4">
        <div
          className={`${cardClassName} flex flex-col gap-3 px-4 py-3 shadow-[0_12px_32px_rgb(0_0_0/0.12)] sm:flex-row sm:items-center sm:justify-between`}
        >
          <p
            aria-live="polite"
            className={`flex min-w-0 items-start gap-1.5 text-sm ${statusIsError ? "font-medium text-danger" : "text-ink/55"}`}
            role="status"
          >
            {statusIsError ? <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" /> : null}
            {statusMessage}
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <button className={`${secondaryButtonClassName} flex-1 sm:flex-none`} disabled={saving} onClick={onCancel} type="button">
              Cancel
            </button>
            <button
              className={`${primaryButtonClassName} flex-1 sm:flex-none`}
              disabled={saving}
              form={FORM_ID}
              type="submit"
            >
              {saving ? (
                <Loader2 aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />
              ) : (
                <Save aria-hidden="true" className="size-4" />
              )}
              {saving ? "Saving" : "Save changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
