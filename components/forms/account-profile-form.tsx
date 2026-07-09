"use client";

import { ComponentType, FormEvent, useEffect, useState } from "react";
import { Globe, Pencil, Save, X } from "lucide-react";
import { FaLinkedin } from "react-icons/fa6";
import { SiDevpost, SiGithub, SiInstagram, SiX } from "react-icons/si";

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
  "w-full rounded-lg border border-black/15 bg-white px-3 py-2.5 text-sm text-black outline-none transition placeholder:text-[#706F6B] focus:border-[#660000] focus:bg-white focus:ring-2 focus:ring-[#660000]/15";
const labelClassName = "mb-1.5 block text-sm font-semibold text-black";
const headingClassName = "text-sm font-semibold uppercase tracking-[0.2em] text-[#660000]";
const detailLabelClassName = "text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-[#706F6B]";

function formValue(formData: FormData, name: keyof ProfileValues) {
  return formData.get(name)?.toString() ?? "";
}

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
    setStatus("saving");

    const formData = new FormData(event.currentTarget);
    const payload = {
      headline: formValue(formData, "headline"),
      bio: formValue(formData, "bio"),
      locationCity: formValue(formData, "locationCity"),
      locationRegion: formValue(formData, "locationRegion"),
      school: formValue(formData, "school"),
      githubUrl: formValue(formData, "githubUrl"),
      linkedinUrl: formValue(formData, "linkedinUrl"),
      instagramUrl: formValue(formData, "instagramUrl"),
      xUrl: formValue(formData, "xUrl"),
      devpostUrl: formValue(formData, "devpostUrl"),
      portfolioUrl: formValue(formData, "portfolioUrl"),
    };

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
      <div className="rounded-2xl border border-black/10 bg-[#F7F7F4] p-6 sm:p-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
          <div
            aria-hidden="true"
            className="flex size-16 shrink-0 items-center justify-center rounded-full bg-[#660000] text-2xl font-semibold text-[#EFEDEA]"
          >
            {initials}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <p className={headingClassName}>My account</p>
                <h1 className="mt-2 text-3xl font-semibold leading-tight text-black">{displayName}</h1>
              </div>
              <button
                type="button"
                onClick={() => {
                  setStatus("idle");
                  setIsEditing(true);
                }}
                className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-[#660000] bg-white px-4 text-sm font-semibold text-[#660000] transition hover:bg-[#660000] hover:text-white focus-visible:bg-[#660000] focus-visible:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#660000]"
              >
                <Pencil aria-hidden="true" className="size-4" />
                Edit profile
              </button>
            </div>

            <dl className="mt-5 grid gap-x-8 gap-y-4 sm:grid-cols-2">
              {profileDetails.map(({ label, value, breakAll }) => (
                <div key={label} className={label === "Bio" ? "sm:col-span-2" : undefined}>
                  <dt className={detailLabelClassName}>{label}</dt>
                  <dd className={`mt-1 text-sm leading-6 text-black${breakAll ? " break-all" : ""}`}>{value}</dd>
                </div>
              ))}
            </dl>

            {links.length > 0 ? (
              <div className="mt-5 border-t border-black/10 pt-5">
                <p className={detailLabelClassName}>Socials</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {links.map(({ href, icon: Icon, label }) => (
                    <a
                      className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-3 py-1.5 text-sm text-[#706F6B] transition hover:border-[#660000] hover:text-[#660000]"
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
            className="flex max-h-full w-full max-w-3xl flex-col rounded-xl border border-black/10 bg-white text-left shadow-2xl"
          >
            <div className="flex shrink-0 items-center justify-between gap-3 px-6 pt-6 pb-4">
              <h2 className={headingClassName}>Edit profile</h2>
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                aria-label="Close"
                className="inline-flex size-8 items-center justify-center rounded-lg text-[#706F6B] transition hover:bg-black/5 hover:text-black"
              >
                <X aria-hidden="true" className="size-4" />
              </button>
            </div>

          <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto px-6 py-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={labelClassName} htmlFor="headline">
                Headline
              </label>
              <input id="headline" name="headline" defaultValue={values.headline ?? ""} className={inputClassName} />
            </div>
            <div>
              <label className={labelClassName} htmlFor="school">
                University
              </label>
              <input id="school" name="school" defaultValue={values.school ?? ""} className={inputClassName} />
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
              <textarea id="bio" name="bio" rows={2} defaultValue={values.bio ?? ""} className={inputClassName} />
            </div>
            {[
              ["linkedinUrl", "LinkedIn"],
              ["instagramUrl", "Instagram"],
              ["xUrl", "X"],
              ["devpostUrl", "Devpost"],
              ["githubUrl", "GitHub"],
              ["portfolioUrl", "Portfolio"],
            ].map(([name, label]) => (
              <div key={name}>
                <label className={labelClassName} htmlFor={name}>
                  {label}
                </label>
                <input
                  id={name}
                  name={name}
                  type="url"
                  defaultValue={values[name as keyof ProfileValues] ?? ""}
                  className={inputClassName}
                />
              </div>
            ))}
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-3 border-t border-black/10 px-6 py-4">
            <button
              disabled={status === "saving"}
              type="submit"
              className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[#660000] px-4 text-sm font-semibold text-[#EFEDEA] transition hover:bg-[#4d0000] disabled:opacity-60"
            >
              <Save aria-hidden="true" className="size-4" />
              {status === "saving" ? "Saving" : "Save profile"}
            </button>
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-black/15 px-4 text-sm font-semibold text-black transition hover:bg-black/5"
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
