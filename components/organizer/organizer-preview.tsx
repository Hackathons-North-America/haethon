"use client";

import { useState } from "react";

import {
  OrganizerHackathonManager,
  type OrganizerHackathonItem,
} from "@/components/organizer/organizer-hackathon-manager";

const inputClassName =
  "w-full rounded-xl border border-navy/15 dark:border-white/15 bg-white dark:bg-white/[0.06] px-3 py-2 text-sm text-navy dark:text-wheat outline-none focus:border-cabernet focus:ring-2 focus:ring-cabernet/15";

/**
 * Admin-only tool: pick any hackathon and see exactly what its organizer sees
 * in the organizer console. All actions run against the real organizer APIs
 * (admins pass the same authorization checks), so this is a live preview.
 */
export function OrganizerPreview({ hackathons }: { hackathons: OrganizerHackathonItem[] }) {
  const [selectedId, setSelectedId] = useState<string>(hackathons[0]?.id ?? "");
  const selected = hackathons.find((item) => item.id === selectedId) ?? null;

  if (!hackathons.length) {
    return (
      <p className="rounded-xl p-6 text-sm leading-6 text-navy/55 dark:text-wheat/55">
        There are no published hackathons to preview yet.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl p-5">
        <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-navy/55 dark:text-wheat/55" htmlFor="preview-hackathon">
          Hackathon
        </label>
        <select
          className={`${inputClassName} max-w-md`}
          id="preview-hackathon"
          onChange={(event) => setSelectedId(event.target.value)}
          value={selectedId}
        >
          {hackathons.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <p className="mt-2 text-sm leading-6 text-navy/55 dark:text-wheat/55">
          This is the live organizer console for the selected hackathon. Changes you save here are real.
        </p>
      </div>

      {selected ? (
        <OrganizerHackathonManager current={[selected]} key={selected.id} past={[]} />
      ) : null}
    </div>
  );
}
