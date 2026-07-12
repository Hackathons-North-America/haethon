"use client";

import { ComponentType, FormEvent, useEffect, useState } from "react";
import { Globe, Pencil, Save, X } from "lucide-react";
import { FaLinkedin } from "react-icons/fa6";
import { SiDevpost, SiGithub, SiInstagram, SiX } from "react-icons/si";

import { containsProfanity } from "@/lib/validations/profanity";
import {
  SOCIAL_PLATFORMS,
  parsePortfolioUrl,
  parseSocialInput,
  type SocialPlatformKey,
} from "@/lib/validations/social";

type IconComponent = ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" }>;

type ProfileValues = {
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
};

type ProfileFormProps = {
  displayEmail: string;
  displayName: string;
  profile: ProfileValues | null;
};

type ProfileLink = {
  href: string;
  icon: IconComponent;
  label: string;
};

const inputClassName =
  "w-full rounded-xl border border-navy/15 dark:border-white/15 bg-white dark:bg-white/[0.06] px-3 py-2.5 text-sm text-navy dark:text-wheat outline-none transition placeholder:text-navy/55 dark:placeholder:text-wheat/40 focus:border-cabernet focus:bg-white focus:ring-2 focus:ring-cabernet/15";
const prefixGroupClassName =
  "flex w-full items-stretch overflow-hidden rounded-xl border bg-white dark:bg-white/[0.06] transition focus-within:border-cabernet focus-within:ring-2 focus-within:ring-cabernet/15";
const prefixLabelClassName =
  "flex select-none items-center border-r border-navy/10 dark:border-white/10 bg-navy/[0.03] dark:bg-white/[0.04] px-3 text-sm text-navy/55 dark:text-wheat/55";
const prefixInputClassName =
  "w-full min-w-0 flex-1 bg-transparent px-3 py-2.5 text-sm text-navy dark:text-wheat outline-none placeholder:text-navy/55 dark:placeholder:text-wheat/40";
const labelClassName = "mb-1.5 block text-sm font-semibold text-navy dark:text-wheat";
const headingClassName = "text-sm font-semibold uppercase tracking-[0.2em] text-rust";
const detailLabelClassName = "text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-navy/55 dark:text-wheat/55";
const fieldErrorClassName = "mt-1.5 text-xs font-semibold text-[#B42318]";
const errorBorderClassName = "border-[#B42318]";
const defaultBorderClassName = "border-navy/15 dark:border-white/15";

const PROFANITY_MESSAGE = "Please remove the inappropriate language.";
const SOCIAL_FIELDS: SocialPlatformKey[] = ["linkedinUrl", "instagramUrl", "xUrl", "devpostUrl", "githubUrl"];

function formValue(formData: FormData, name: keyof ProfileValues) {
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

function draftsFromValues(values: ProfileValues) {
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

function labelFromUrl(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "") + parsed.pathname.replace(/\/$/, "");
  } catch {
    return url;
  }
}

function compactHandle(url: string, fallback: string) {
  try {
    const parsed = new URL(url);
    const handle = parsed.pathname.split("/").filter(Boolean).at(-1);
    return handle ? `/${handle}` : fallback;
  } catch {
    return fallback;
  }
}

export function AccountProfileForm({ displayEmail, displayName, profile }: ProfileFormProps) {
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [isEditing, setIsEditing] = useState(false);
  const [values, setValues] = useState<ProfileValues>({
    headline: profile?.headline ?? "",
    bio: profile?.bio ?? "",
    locationCity: profile?.locationCity ?? "",
    locationRegion: profile?.locationRegion ?? "",
    school: profile?.school ?? "",
    githubUrl: profile?.githubUrl ?? "",
    linkedinUrl: profile?.linkedinUrl ?? "",
    instagramUrl: profile?.instagramUrl ?? "",
    xUrl: profile?.xUrl ?? "",
    devpostUrl: profile?.devpostUrl ?? "",
    portfolioUrl: profile?.portfolioUrl ?? "",
  });
  const [socialDrafts, setSocialDrafts] = useState<SocialDrafts>(() => draftsFromValues(values));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function clearFieldError(name: string) {
    setFieldErrors(({ [name]: _removed, ...rest }) => rest);
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

  useEffect(() => {
    if (!isEditing) {
      return;
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsEditing(false);
      }
    }

    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isEditing]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const errors: Record<string, string> = {};

    const textPayload = {
      headline: formValue(formData, "headline"),
      bio: formValue(formData, "bio"),
      locationCity: formValue(formData, "locationCity"),
      locationRegion: formValue(formData, "locationRegion"),
      school: formValue(formData, "school"),
    };

    for (const name of ["headline", "bio", "school"] as const) {
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
      return;
    }

    setFieldErrors({});
    setStatus("saving");

    const payload = { ...textPayload, ...socialPayload };

    const response = await fetch("/api/account/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      setValues(payload);
      setStatus("saved");
      setIsEditing(false);
      return;
    }

    // Surface server-side validation errors on the fields they belong to.
    const body = await response.json().catch(() => null);
    const serverErrors = body?.error?.fieldErrors as Record<string, string[]> | undefined;

    if (serverErrors) {
      setFieldErrors(
        Object.fromEntries(
          Object.entries(serverErrors)
            .filter(([, messages]) => messages?.length)
            .map(([name, messages]) => [name, messages[0]])
        )
      );
    }

    setStatus("error");
  }

  const location = [values.locationCity, values.locationRegion].filter(Boolean).join(", ");
  const rawLinks: { label: string; href: string | null | undefined; icon: IconComponent }[] = [
    { label: values.githubUrl ? compactHandle(values.githubUrl, "GitHub") : "GitHub", href: values.githubUrl, icon: SiGithub },
    { label: values.linkedinUrl ? compactHandle(values.linkedinUrl, "LinkedIn") : "LinkedIn", href: values.linkedinUrl, icon: FaLinkedin },
    { label: values.instagramUrl ? compactHandle(values.instagramUrl, "Instagram") : "Instagram", href: values.instagramUrl, icon: SiInstagram },
    { label: values.xUrl ? compactHandle(values.xUrl, "X") : "X", href: values.xUrl, icon: SiX },
    { label: values.devpostUrl ? labelFromUrl(values.devpostUrl) : "Devpost", href: values.devpostUrl, icon: SiDevpost },
    { label: values.portfolioUrl ? labelFromUrl(values.portfolioUrl) : "Portfolio", href: values.portfolioUrl, icon: Globe },
  ];
  const links = rawLinks.filter((link): link is ProfileLink => Boolean(link.href));
  const initials =
    displayName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || displayName[0]?.toUpperCase() || "?";
  const profileDetails = [
    { label: "Email", value: displayEmail, breakAll: true },
    values.headline ? { label: "Headline", value: values.headline } : null,
    values.bio ? { label: "Bio", value: values.bio } : null,
    values.school ? { label: "University", value: values.school } : null,
    location ? { label: "Location", value: location } : null,
  ].filter((detail) => detail !== null);

  return (
    <section>
      {/* Profile header: identity and labeled details, followed by socials */}
      <div className="rounded-2xl border border-navy/10 dark:border-white/10 bg-ivory dark:bg-white/5 p-6 sm:p-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
          <div
            aria-hidden="true"
            className="flex size-16 shrink-0 items-center justify-center rounded-full bg-cabernet text-2xl font-semibold text-wheat dark:bg-wheat dark:text-[#141414] dark:hover:bg-white"
          >
            {initials}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <p className={headingClassName}>My account</p>
                <h1 className="mt-2 font-serif text-3xl font-semibold tracking-[-0.02em] leading-tight text-navy dark:text-wheat">{displayName}</h1>
              </div>
              <button
                type="button"
                onClick={() => {
                  setStatus("idle");
                  setSocialDrafts(draftsFromValues(values));
                  setFieldErrors({});
                  setIsEditing(true);
                }}
                className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-full border border-cabernet dark:border-[#e4a3ab]/50 bg-white dark:bg-white/[0.06] px-4 text-sm font-semibold text-cabernet dark:text-[#e4a3ab] transition hover:bg-cabernet hover:text-wheat dark:bg-wheat dark:text-[#141414] dark:hover:bg-white focus-visible:bg-cabernet focus-visible:text-wheat focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cabernet dark:focus-visible:outline-wheat"
              >
                <Pencil aria-hidden="true" className="size-4" />
                Edit profile
              </button>
            </div>

            <dl className="mt-5 grid gap-x-8 gap-y-4 sm:grid-cols-2">
              {profileDetails.map(({ label, value, breakAll }) => (
                <div key={label} className={label === "Bio" ? "sm:col-span-2" : undefined}>
                  <dt className={detailLabelClassName}>{label}</dt>
                  <dd className={`mt-1 text-sm leading-6 text-navy dark:text-wheat${breakAll ? " break-all" : ""}`}>{value}</dd>
                </div>
              ))}
            </dl>

            {links.length > 0 ? (
              <div className="mt-5 border-t border-navy/10 dark:border-white/10 pt-5">
                <p className={detailLabelClassName}>Socials</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {links.map(({ href, icon: Icon, label }) => (
                    <a
                      className="inline-flex items-center gap-2 rounded-full border border-navy/10 dark:border-white/10 bg-white dark:bg-white/[0.06] px-3 py-1.5 text-sm text-navy/55 dark:text-wheat/55 transition hover:border-cabernet dark:hover:border-[#e4a3ab]/60 hover:text-cabernet dark:hover:text-[#e4a3ab]"
                      href={href}
                      key={href}
                      rel="noreferrer"
                      target="_blank"
                    >
                      <Icon aria-hidden="true" className="size-4 shrink-0" />
                      <span className="break-all">{label}</span>
                    </a>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {status === "saved" ? <p className="mt-3 text-center text-sm font-semibold text-[#027A48]">Saved</p> : null}

      {isEditing ? (
        <div
          className="fixed inset-0 z-50 overflow-hidden bg-black/40 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Edit profile"
        >
          <div
            className="flex h-dvh items-center justify-center px-4 py-8"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                setIsEditing(false);
              }
            }}
          >
          <form
            onSubmit={onSubmit}
            className="flex max-h-full w-full max-w-3xl flex-col rounded-xl border border-navy/10 dark:border-white/10 bg-white dark:bg-white/[0.06] text-left shadow-2xl"
          >
            <div className="flex shrink-0 items-center justify-between gap-3 px-6 pt-6 pb-4">
              <h2 className={headingClassName}>Edit profile</h2>
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                aria-label="Close"
                className="inline-flex size-8 items-center justify-center rounded-xl text-navy/55 dark:text-wheat/55 transition hover:bg-navy/5 dark:hover:bg-white/10 hover:text-navy dark:hover:text-wheat"
              >
                <X aria-hidden="true" className="size-4" />
              </button>
            </div>

          <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto px-6 py-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={labelClassName} htmlFor="headline">
                Headline
              </label>
              <input
                id="headline"
                name="headline"
                maxLength={160}
                defaultValue={values.headline ?? ""}
                onChange={() => clearFieldError("headline")}
                className={inputClassName}
              />
              {fieldErrors.headline ? <p className={fieldErrorClassName}>{fieldErrors.headline}</p> : null}
            </div>
            <div>
              <label className={labelClassName} htmlFor="school">
                University
              </label>
              <input
                id="school"
                name="school"
                maxLength={160}
                defaultValue={values.school ?? ""}
                onChange={() => clearFieldError("school")}
                className={inputClassName}
              />
              {fieldErrors.school ? <p className={fieldErrorClassName}>{fieldErrors.school}</p> : null}
            </div>
            <div>
              <label className={labelClassName} htmlFor="locationCity">
                City
              </label>
              <input id="locationCity" name="locationCity" defaultValue={values.locationCity ?? ""} className={inputClassName} />
            </div>
            <div>
              <label className={labelClassName} htmlFor="locationRegion">
                Region
              </label>
              <input id="locationRegion" name="locationRegion" defaultValue={values.locationRegion ?? ""} className={inputClassName} />
            </div>
            <div>
              <label className={labelClassName} htmlFor="bio">
                Bio
              </label>
              <textarea
                id="bio"
                name="bio"
                rows={2}
                maxLength={2000}
                defaultValue={values.bio ?? ""}
                onChange={() => clearFieldError("bio")}
                className={inputClassName}
              />
              {fieldErrors.bio ? <p className={fieldErrorClassName}>{fieldErrors.bio}</p> : null}
            </div>
            {SOCIAL_FIELDS.map((name) => {
              const platform = SOCIAL_PLATFORMS[name];

              return (
                <div key={name}>
                  <label className={labelClassName} htmlFor={name}>
                    {platform.label}
                  </label>
                  <div
                    className={`${prefixGroupClassName} ${fieldErrors[name] ? errorBorderClassName : defaultBorderClassName}`}
                  >
                    <span aria-hidden="true" className={prefixLabelClassName}>
                      {platform.prefix}
                    </span>
                    <input
                      id={name}
                      value={socialDrafts[name]}
                      onChange={(event) => onSocialChange(name, event.target.value)}
                      placeholder="your-handle"
                      autoComplete="off"
                      autoCapitalize="none"
                      spellCheck={false}
                      aria-invalid={Boolean(fieldErrors[name])}
                      className={prefixInputClassName}
                    />
                  </div>
                  {fieldErrors[name] ? <p className={fieldErrorClassName}>{fieldErrors[name]}</p> : null}
                </div>
              );
            })}
            <div>
              <label className={labelClassName} htmlFor="portfolioUrl">
                Portfolio
              </label>
              <input
                id="portfolioUrl"
                value={socialDrafts.portfolioUrl}
                onChange={(event) => {
                  const next = event.target.value;
                  setSocialDrafts((drafts) => ({ ...drafts, portfolioUrl: next }));
                  clearFieldError("portfolioUrl");
                }}
                placeholder="https://your-site.dev"
                inputMode="url"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                aria-invalid={Boolean(fieldErrors.portfolioUrl)}
                className={`${inputClassName} ${fieldErrors.portfolioUrl ? errorBorderClassName : ""}`}
              />
              {fieldErrors.portfolioUrl ? <p className={fieldErrorClassName}>{fieldErrors.portfolioUrl}</p> : null}
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-3 border-t border-navy/10 dark:border-white/10 px-6 py-4">
            <button
              disabled={status === "saving"}
              type="submit"
              className="inline-flex min-h-10 items-center gap-2 rounded-full bg-cabernet px-4 text-sm font-semibold text-wheat dark:bg-wheat dark:text-[#141414] dark:hover:bg-white transition hover:bg-[#5c151c] disabled:opacity-60"
            >
              <Save aria-hidden="true" className="size-4" />
              {status === "saving" ? "Saving" : "Save profile"}
            </button>
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="inline-flex min-h-10 items-center gap-2 rounded-full border border-navy/15 dark:border-white/15 px-4 text-sm font-semibold text-navy dark:text-wheat transition hover:bg-navy/5 dark:hover:bg-white/10"
            >
              Cancel
            </button>
            {status === "error" ? <p className="text-sm font-semibold text-[#B42318]">Could not save</p> : null}
          </div>
          </form>
          </div>
        </div>
      ) : null}
    </section>
  );
}
