"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState, type ElementType, type KeyboardEvent } from "react";
import { FileText, KeyRound, Users } from "lucide-react";

import { AttendeesTab } from "./attendees-tab";
import { CheckinTab } from "./checkin-tab";
import { DetailsTab } from "./details-tab";
import {
  WORKSPACE_TABS,
  focusRingClassName,
  type OrganizerHackathonItem,
  type WorkspaceTab,
} from "./shared";
import { WorkspaceHeader } from "./workspace-header";

const TAB_META: Record<WorkspaceTab, { label: string; icon: ElementType }> = {
  details: { label: "Details", icon: FileText },
  checkin: { label: "Check-in", icon: KeyRound },
  attendees: { label: "Attendees", icon: Users },
};

/* Writes the tab into the address bar so a refresh, or a shared link, lands on
   the same tab. Next patches history.replaceState and syncs its router (and
   useSearchParams) with the new URL, and unlike router.replace() this doesn't
   refetch the page on the server (or show the route's loading state, which
   would unmount the open form). The state argument must be null: Next skips
   the sync for states carrying its own internal marker, so passing
   history.state back in would leave the router on the old URL. Details is the
   default, so it drops the param instead of spelling it out. */
function writeTabToUrl(tab: WorkspaceTab) {
  const url = new URL(window.location.href);

  if (tab === "details") {
    url.searchParams.delete("tab");
  } else {
    url.searchParams.set("tab", tab);
  }

  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

/**
 * One hackathon's organizer workspace: the header plus Details / Check-in /
 * Attendees tabs. Holds the hackathon in state so a save on the Details tab
 * updates the header (name, dates, location) straight away, then refreshes
 * the server page so what only the server derives (the public page link,
 * which depends on the re-derived status) catches up. The refreshed `item`
 * prop replaces the local copy; the active tab is client state and survives.
 *
 * Only the active tab is mounted, except Details, which stays mounted while
 * hidden so unsaved form edits survive a trip to another tab. Check-in and
 * Attendees reload their data each time they're opened, which keeps the
 * attendee list fresh during an event.
 */
export function OrganizerHackathonWorkspace({
  item: initialItem,
  publicPath,
  initialTab = "details",
  syncTabToUrl = true,
  now,
}: {
  item: OrganizerHackathonItem;
  /* Read straight from props (not state) so a router.refresh() updates it. */
  publicPath: string | null;
  initialTab?: WorkspaceTab;
  syncTabToUrl?: boolean;
  /* Server render time (ISO) for the header's phase badge, so server and
     client agree near a start/end boundary. Callers without a server clock
     (the admin preview) fall back to the current time. */
  now?: string;
}) {
  const router = useRouter();
  const [item, setItem] = useState(initialItem);
  const [syncedInitialItem, setSyncedInitialItem] = useState(initialItem);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>(initialTab);
  const [fallbackNow] = useState(() => new Date().toISOString());
  const tabRefs = useRef<Partial<Record<WorkspaceTab, HTMLButtonElement | null>>>({});
  const idPrefix = useId();
  const tabId = (tab: WorkspaceTab) => `${idPrefix}-tab-${tab}`;
  const panelId = (tab: WorkspaceTab) => `${idPrefix}-panel-${tab}`;

  /* Adopt a refreshed copy from the server (after a save's router.refresh()). */
  if (initialItem !== syncedInitialItem) {
    setSyncedInitialItem(initialItem);
    setItem(initialItem);
  }

  function onSaved(next: OrganizerHackathonItem) {
    setItem(next);

    // Only the real page has server data to refresh; the admin preview passes
    // publicPath={null} and syncTabToUrl={false} and manages its own list.
    if (syncTabToUrl) {
      router.refresh();
    }
  }

  function selectTab(tab: WorkspaceTab) {
    if (tab === activeTab) {
      return;
    }

    setActiveTab(tab);

    if (syncTabToUrl) {
      writeTabToUrl(tab);
    }
  }

  /* Roving focus per the ARIA tabs pattern, with automatic activation: the
     arrow keys wrap, Home/End jump to the ends. */
  function onTabKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const index = WORKSPACE_TABS.indexOf(activeTab);
    const last = WORKSPACE_TABS.length - 1;
    let next: number | null = null;

    if (event.key === "ArrowRight") next = index === last ? 0 : index + 1;
    else if (event.key === "ArrowLeft") next = index === 0 ? last : index - 1;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = last;

    if (next === null) {
      return;
    }

    event.preventDefault();
    const tab = WORKSPACE_TABS[next];
    selectTab(tab);
    tabRefs.current[tab]?.focus();
  }

  return (
    <div className="space-y-6 sm:space-y-8">
      <WorkspaceHeader item={item} now={now ?? fallbackNow} publicPath={publicPath} />

      <div className="space-y-6">
        {/* The row scrolls inside itself if it ever outgrows a narrow screen,
            rather than widening the page. */}
        <div
          aria-label="Hackathon workspace"
          className="-mx-4 flex gap-1 overflow-x-auto border-b border-ink/10 px-4 sm:mx-0 sm:px-0"
          role="tablist"
        >
          {WORKSPACE_TABS.map((tab) => {
            const { icon: Icon, label } = TAB_META[tab];
            const selected = tab === activeTab;

            return (
              <button
                aria-controls={panelId(tab)}
                aria-selected={selected}
                className={`relative inline-flex min-h-11 shrink-0 items-center gap-2 rounded-t-lg px-3 text-sm font-semibold transition-colors sm:px-4 ${
                  selected ? "text-ink" : "text-ink/55 hover:text-ink"
                } ${focusRingClassName}`}
                id={tabId(tab)}
                key={tab}
                onClick={() => selectTab(tab)}
                onKeyDown={onTabKeyDown}
                ref={(node) => {
                  tabRefs.current[tab] = node;
                }}
                role="tab"
                tabIndex={selected ? 0 : -1}
                type="button"
              >
                <Icon aria-hidden="true" className={`size-4 ${selected ? "text-pine" : ""}`} />
                {label}
                <span
                  aria-hidden="true"
                  className={`absolute inset-x-2 -bottom-px h-0.5 rounded-full ${selected ? "bg-pine" : "bg-transparent"}`}
                />
              </button>
            );
          })}
        </div>

        {WORKSPACE_TABS.map((tab) => {
          const selected = tab === activeTab;
          const mounted = selected || tab === "details";

          return (
            <div
              aria-labelledby={tabId(tab)}
              className={`rounded-2xl ${focusRingClassName}`}
              hidden={!selected}
              id={panelId(tab)}
              key={tab}
              role="tabpanel"
              tabIndex={0}
            >
              {mounted ? (
                tab === "details" ? (
                  <DetailsTab item={item} onSaved={onSaved} />
                ) : tab === "checkin" ? (
                  <CheckinTab hackathonId={item.id} />
                ) : (
                  <AttendeesTab hackathonId={item.id} />
                )
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
