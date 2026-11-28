"use client";

import { useState } from "react";
import { TriangleAlert } from "lucide-react";

import {
  cardClassName,
  eyebrowClassName,
  inputClassName,
  type OrganizerHackathonItem,
} from "@/components/organizer/detail/shared";
import { OrganizerHackathonWorkspace } from "@/components/organizer/detail/workspace";

/**
 * Admin-only tool: pick any hackathon and see exactly what its organizer sees
 * in the organizer console. All actions run against the real organizer APIs
 * (admins pass the same authorization checks), so this is a live preview.
 *
 * The workspace's tab stays in local state here (syncTabToUrl={false}) so it
 * doesn't write /organizer-style ?tab= params onto the admin URL, and it is
 * keyed by hackathon so switching resets every tab's state.
 */
export function OrganizerPreview({ hackathons }: { hackathons: OrganizerHackathonItem[] }) {
  const [selectedId, setSelectedId] = useState<string>(hackathons[0]?.id ?? "");
  const selected = hackathons.find((item) => item.id === selectedId) ?? null;

  if (!hackathons.length) {
    return (
      <p className={`${cardClassName} p-6 text-sm leading-6 text-ink/55`}>
        There are no published hackathons to preview yet.
      </p>
    );
  }

  return (
    <div className="space-y-6 sm:space-y-8">
      <div className={`${cardClassName} space-y-4 p-4 sm:p-5`}>
        <div className="max-w-md">
          <label className={`${eyebrowClassName} mb-1.5 block`} htmlFor="preview-hackathon">
            Hackathon
          </label>
          <select
            className={`${inputClassName} min-h-11`}
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
        </div>
        <p
          className="flex items-start gap-2.5 rounded-xl bg-warning-soft px-3.5 py-3 text-sm leading-6 text-warning-ink"
          role="note"
        >
          <TriangleAlert aria-hidden="true" className="mt-1 size-4 shrink-0" />
          <span>
            This is the live organizer console for the selected hackathon.{" "}
            <strong className="font-semibold">Changes you save here are real.</strong>
          </span>
        </p>
      </div>

      {selected ? (
        <OrganizerHackathonWorkspace item={selected} key={selected.id} publicPath={null} syncTabToUrl={false} />
      ) : null}
    </div>
  );
}
