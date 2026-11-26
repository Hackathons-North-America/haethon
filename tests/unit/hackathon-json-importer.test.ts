import { act, createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HackathonJsonImporter } from "@/components/admin/hackathon-json-importer";
import type { ChannelDecisionCard } from "@/lib/discord/channel-decisions";
import type { ImportCardView } from "@/lib/hackathons/import-cards";

/* The import page keeps no queue of its own: what it shows is what the server
   hands it, and every decision is a request. These tests hold it to that. */

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/import",
  useRouter: () => ({ prefetch: vi.fn(), push: vi.fn(), refresh, replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

function card(id: string, name: string, extra: Partial<ImportCardView> = {}): ImportCardView {
  return {
    id,
    payload: { name, country: "Germany", city: "Berlin", startDate: "2027-01-16T00:00:00.000Z", endDate: "2027-01-17T00:00:00.000Z" },
    duplicate: null,
    error: null,
    via: "scraper",
    createdAt: "2026-11-26T12:00:00.000Z",
    ...extra,
  };
}

type Call = { body: unknown; method: string; url: string };

let root: Root | null = null;
let container: HTMLDivElement;
let calls: Call[];
let respond: (call: Call) => { body: unknown; status?: number };

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  calls = [];
  respond = () => ({ body: {} });
  refresh.mockReset();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const call = { body: init?.body ? JSON.parse(String(init.body)) : undefined, method: init?.method ?? "GET", url };
      calls.push(call);
      const { body, status = 200 } = respond(call);

      return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
    })
  );
  container = document.createElement("div");
  document.body.append(container);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

function channelCard(hackathonId: string, name: string, action: "create" | "recycle" = "create"): ChannelDecisionCard {
  return {
    hackathonId,
    payload: { name, country: "Canada", city: "Toronto", startDate: "2027-01-16T00:00:00.000Z", endDate: "2027-01-17T00:00:00.000Z" },
    discord: {
      action,
      category: "canada",
      categoryName: "Canada Hackathons",
      eligible: true,
      existingChannelName: action === "recycle" ? "maple-hacks" : null,
      name: "jan-16-maple-hacks",
    },
  };
}

async function mount(cards: ImportCardView[], channelCards: ChannelDecisionCard[] = []) {
  root = createRoot(container);
  await act(async () => root!.render(h(HackathonJsonImporter, { initialCards: cards, initialChannelCards: channelCards })));
}

function button(label: string) {
  const found = [...container.querySelectorAll("button")].find((entry) => entry.textContent?.trim() === label);

  if (!found) {
    throw new Error(`No "${label}" button. Buttons: ${[...container.querySelectorAll("button")].map((entry) => entry.textContent?.trim()).join(" | ")}`);
  }

  return found;
}

async function click(label: string) {
  await act(async () => button(label).click());
}

const text = () => container.textContent ?? "";

describe("the review queue on the import page", () => {
  it("opens on the cards the server says are waiting", async () => {
    await mount([card("c1", "First Hack"), card("c2", "Second Hack")]);

    expect(text()).toContain("2 waiting for review");
    expect(text()).toContain("First Hack");
    expect(text()).toContain("by the scraper");
    expect(text()).not.toContain("Second Hack");
    // Nothing is asked of the server just to show the queue.
    expect(calls).toEqual([]);
  });

  it("sends a yes to the server and shows the next card", async () => {
    respond = () => ({ body: { data: { status: "decided", result: { index: 0, name: "First Hack", status: "imported", duplicateScore: 0, hackathonId: "h1", discord: { eligible: false } } } } });
    await mount([card("c1", "First Hack"), card("c2", "Second Hack")]);

    await click("Yes");

    expect(calls).toEqual([{ body: { action: "approve" }, method: "POST", url: "/api/admin/import-queue/c1" }]);
    expect(text()).toContain("1 waiting for review");
    expect(text()).toContain("this visit: 1 approved");
    expect(text()).toContain("Second Hack");
  });

  it("records a no, and falls back to the upload form once the queue is empty", async () => {
    respond = () => ({ body: { data: { status: "rejected" } } });
    await mount([card("c1", "First Hack")]);

    await click("No");

    expect(calls[0]).toEqual({ body: { action: "reject" }, method: "POST", url: "/api/admin/import-queue/c1" });
    expect(text()).toContain("0 waiting for review");
    expect(text()).toContain("1 declined");
    expect(container.querySelector("textarea")).not.toBeNull();
  });

  it("keeps a card for later without telling the server", async () => {
    await mount([card("c1", "First Hack"), card("c2", "Second Hack")]);

    await click("Later");

    expect(calls).toEqual([]);
    expect(text()).toContain("2 waiting for review");
    expect(text()).toContain("Second Hack");
  });

  it("offers merge for a possible duplicate", async () => {
    respond = () => ({ body: { data: { status: "decided", result: { index: 0, name: "First Hack", status: "auto_merged", duplicateScore: 0.7, hackathonId: "h9", matchedName: "First Hackathon" } } } });
    await mount([card("c1", "First Hack", { duplicate: { hackathonId: "h9", name: "First Hackathon", score: 0.7 } })]);

    expect(text()).toContain("Possible duplicate");
    expect(text()).toContain("First Hackathon");

    await click("Merge into existing");

    expect(calls[0].body).toEqual({ action: "merge" });
    expect(text()).toContain("1 merged");
  });

  it("shows the match when approval finds a duplicate, and leaves the card in place", async () => {
    respond = () => ({ body: { data: { status: "decided", result: { index: 0, name: "First Hack", status: "duplicate_flagged", duplicateScore: 0.68, matchedHackathonId: "h9", matchedName: "First Hackathon" } } } });
    await mount([card("c1", "First Hack")]);

    await click("Yes");

    expect(text()).toContain("1 waiting for review");
    expect(text()).toContain("Possible duplicate");
    expect(button("Import as new anyway")).toBeTruthy();
  });

  it("moves on when another admin already decided the card", async () => {
    respond = () => ({ body: { error: "This card has already been reviewed." }, status: 409 });
    await mount([card("c1", "First Hack"), card("c2", "Second Hack")]);

    await click("Yes");

    expect(text()).toContain("already reviewed somewhere else");
    expect(text()).toContain("Second Hack");
    expect(text()).not.toContain("approved");
  });

  it("says what is wrong with a card that cannot be imported yet", async () => {
    respond = () => ({
      body: { error: "This card needs fixing before it can be imported.", details: { formErrors: [], fieldErrors: { country: ["Required"] } } },
      status: 400,
    });
    await mount([card("c1", "First Hack", { error: "country: Required" })]);

    expect(text()).toContain("Importing this card failed: country: Required");

    await click("Yes");

    expect(text()).toContain("needs fixing before it can be imported. country: Required");
    expect(text()).toContain("1 waiting for review");
  });
});

describe("uploading JSON", () => {
  async function upload(rows: unknown[]) {
    const textarea = container.querySelector("textarea")!;
    const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;

    await act(async () => {
      setValue.call(textarea, JSON.stringify(rows));
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await click("Import JSON");
  }

  it("sends every row to the server and then reads the queue back from it", async () => {
    respond = (call) =>
      call.url === "/api/admin/hackathon-imports"
        ? {
            body: {
              data: {
                results: [
                  { index: 0, name: "Auto Hack", status: "imported", duplicateScore: 0, hackathonId: "h1" },
                  { index: 1, name: "Manual Hack", status: "queued", duplicateScore: 0, submissionId: "c1" },
                ],
              },
            },
            status: 201,
          }
        : { body: { data: { cards: [card("c1", "Manual Hack", { via: "upload" })], channelCards: [] } } };
    await mount([]);

    await upload([{ name: "Auto Hack", autoApprove: true }, { name: "Manual Hack" }]);

    expect(calls.map((call) => `${call.method} ${call.url}`)).toEqual(["POST /api/admin/hackathon-imports", "GET /api/admin/import-queue"]);
    // Both rows went up: the row that needs a yes or no is the server's to keep.
    expect(calls[0].body).toEqual([{ name: "Auto Hack", autoApprove: true }, { name: "Manual Hack" }]);
    expect(text()).toContain("Imported 1 of 2 rows right away. 1 card is waiting for review.");
    expect(text()).toContain("Manual Hack");
    expect(text()).toContain("from an upload");
  });

  it("saves a row the import refuses as a card instead of dropping it", async () => {
    respond = (call) => {
      if (call.url === "/api/admin/hackathon-imports") {
        return { body: { error: "country: Required" }, status: 400 };
      }

      return call.method === "POST"
        ? { body: { data: { status: "queued", submissionId: "c1" } }, status: 201 }
        : { body: { data: { cards: [card("c1", "Broken Hack", { error: "country: Required", via: "upload" })], channelCards: [] } } };
    };
    await mount([]);

    await upload([{ name: "Broken Hack" }]);

    expect(calls[1]).toEqual({
      body: { error: "country: Required", payload: { name: "Broken Hack" } },
      method: "POST",
      url: "/api/admin/import-queue",
    });
    expect(text()).toContain("1 failed");
    expect(text()).toContain("Importing this card failed: country: Required");
  });
});

describe("Discord channel decisions", () => {
  it("come up once the event cards are done", async () => {
    respond = () => ({ body: { data: { status: "rejected" } } });
    await mount([card("c1", "First Hack")], [channelCard("h1", "Maple Hacks")]);

    expect(text()).toContain("1 waiting for review · 1 waiting for a channel decision");
    expect(text()).not.toContain("Create a Discord channel?");

    await click("No");

    expect(text()).toContain("Approve Discord channel");
    expect(text()).toContain("Maple Hacks");
    expect(text()).toContain("Approving creates #jan-16-maple-hacks in Canada Hackathons");
  });

  it("queues the channel on approve and shows the next hackathon", async () => {
    respond = (call) =>
      call.url.endsWith("/discord-channel")
        ? { body: { data: { status: "queued", jobId: "job-1" } }, status: 202 }
        : { body: { data: { jobs: [] } } };
    await mount([], [channelCard("h1", "Maple Hacks"), channelCard("h2", "Birch Hacks", "recycle")]);

    await click("Approve channel");

    expect(calls[0]).toEqual({ body: { action: "approve" }, method: "POST", url: "/api/admin/hackathons/h1/discord-channel" });
    expect(text()).toContain("1 channels approved");
    expect(text()).toContain("Birch Hacks");
    expect(text()).toContain("recycles the existing #maple-hacks channel");
  });

  it("stores a no, and puts the card back when that fails", async () => {
    let ok = true;
    respond = () => (ok ? { body: { data: { status: "denied" } } } : { body: { error: "down" }, status: 500 });
    await mount([], [channelCard("h1", "Maple Hacks"), channelCard("h2", "Birch Hacks")]);

    await click("No channel");

    expect(calls[0]).toEqual({ body: { action: "deny" }, method: "POST", url: "/api/admin/hackathons/h1/discord-channel" });
    expect(text()).toContain("1 without a channel");
    expect(text()).toContain("Birch Hacks");

    ok = false;
    await click("No channel");

    expect(text()).toContain("did not reach the server");
    expect(text()).toContain("1 waiting for a channel decision");
    expect(text()).toContain("Birch Hacks");
  });

  it("stores the no from the prompt that follows an approved card", async () => {
    respond = (call) =>
      call.url.endsWith("/discord-channel")
        ? { body: { data: { status: "denied" } } }
        : {
            body: {
              data: {
                status: "decided",
                result: {
                  index: 0,
                  name: "First Hack",
                  status: "imported",
                  duplicateScore: 0,
                  hackathonId: "h9",
                  discord: { action: "create", category: "canada", categoryName: "Canada Hackathons", eligible: true, existingChannelName: null, name: "jan-16-first-hack" },
                },
              },
            },
          };
    await mount([card("c1", "First Hack")]);

    await click("Yes");
    await click("Deny channel");

    expect(calls.map((call) => [call.url, call.body])).toEqual([
      ["/api/admin/import-queue/c1", { action: "approve" }],
      ["/api/admin/hackathons/h9/discord-channel", { action: "deny" }],
    ]);
  });
});
