"use client";

import { FormEvent, useState } from "react";
import { Save } from "lucide-react";

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

const inputClassName =
  "w-full rounded-lg border border-black/15 bg-white px-3 py-2.5 text-sm text-black outline-none transition focus:border-[#660000] focus:ring-2 focus:ring-[#660000]/15";
const labelClassName = "mb-1.5 block text-sm font-semibold text-black";

function formValue(formData: FormData, name: keyof ProfileValues) {
  return formData.get(name)?.toString() ?? "";
}

export function AccountProfileForm({ profile }: { profile: ProfileValues | null }) {
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

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

    setStatus(response.ok ? "saved" : "error");
  }

  return (
    <form onSubmit={onSubmit} className="rounded-lg border border-black/10 bg-white p-5">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className={labelClassName} htmlFor="headline">
            Headline
          </label>
          <input id="headline" name="headline" defaultValue={profile?.headline ?? ""} className={inputClassName} />
        </div>
        <div>
          <label className={labelClassName} htmlFor="school">
            School
          </label>
          <input id="school" name="school" defaultValue={profile?.school ?? ""} className={inputClassName} />
        </div>
        <div>
          <label className={labelClassName} htmlFor="locationCity">
            City
          </label>
          <input id="locationCity" name="locationCity" defaultValue={profile?.locationCity ?? ""} className={inputClassName} />
        </div>
        <div>
          <label className={labelClassName} htmlFor="locationRegion">
            Region
          </label>
          <input id="locationRegion" name="locationRegion" defaultValue={profile?.locationRegion ?? ""} className={inputClassName} />
        </div>
      </div>

      <div className="mt-4">
        <label className={labelClassName} htmlFor="bio">
          Bio
        </label>
        <textarea id="bio" name="bio" rows={4} defaultValue={profile?.bio ?? ""} className={inputClassName} />
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
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
              defaultValue={profile?.[name as keyof ProfileValues] ?? ""}
              className={inputClassName}
            />
          </div>
        ))}
      </div>

      <div className="mt-5 flex items-center gap-3">
        <button
          disabled={status === "saving"}
          type="submit"
          className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[#660000] px-4 text-sm font-semibold text-white transition hover:bg-[#4d0000] disabled:opacity-60"
        >
          <Save aria-hidden="true" className="size-4" />
          {status === "saving" ? "Saving" : "Save profile"}
        </button>
        {status === "saved" ? <p className="text-sm font-semibold text-[#027A48]">Saved</p> : null}
        {status === "error" ? <p className="text-sm font-semibold text-[#B42318]">Could not save</p> : null}
      </div>
    </form>
  );
}
