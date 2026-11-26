// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/* The admin edit route's "HNA approved" toggle, with the services stubbed.
   The write itself runs against a real database in
   tests/integration/cover-retention.test.ts. */
const calls = vi.hoisted(() => [] as string[]);
const setHackathonHnaApproved = vi.fn(async (_id: string, approved: boolean) => {
  calls.push(`hna:${approved}`);
});
const updatePublishedHackathon = vi.fn(async (...args: [id: string, payload: Record<string, unknown>]) => {
  calls.push("update");
  return { ...savedRow, id: args[0] };
});
const setHackathonSource = vi.fn();

const savedRow = {
  id: "h1",
  name: "MapleHacks",
  hnaApproved: true,
  startsAt: new Date("2026-09-12T00:00:00.000Z"),
  endsAt: new Date("2026-09-14T00:00:00.000Z"),
  applicationOpensAt: null,
  applicationClosesAt: null,
  acceptanceAt: null,
};

vi.mock("@/lib/auth", () => ({ requireAdminUser: vi.fn(async () => ({ ok: true })) }));
vi.mock("@/lib/discord/sync", () => ({ assignExistingDiscordChannel: vi.fn() }));
vi.mock("@/lib/hackathons/admin-service", () => ({
  deleteHackathon: vi.fn(),
  getAdminHackathon: vi.fn(),
  setHackathonHnaApproved,
  setHackathonSource,
  updatePublishedHackathon,
}));

const { PATCH } = await import("@/app/api/admin/hackathons/[id]/route");

const body = {
  name: "MapleHacks",
  websiteUrl: "https://maplehacks.example.com",
  country: "Canada",
  startDate: "2026-09-12",
  endDate: "2026-09-14",
  format: "in_person",
};

function patch(json: unknown) {
  return PATCH(new Request("https://example.org/api/admin/hackathons/h1", { method: "PATCH", body: JSON.stringify(json) }), {
    params: Promise.resolve({ id: "h1" }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  calls.length = 0;
});

describe("PATCH /api/admin/hackathons/[id]", () => {
  it("saves the HNA approved toggle before the rest of the edit and returns it", async () => {
    const response = await patch({ ...body, hnaApproved: true });

    expect(response.status).toBe(200);
    expect(setHackathonHnaApproved).toHaveBeenCalledWith("h1", true);
    expect(calls).toEqual(["hna:true", "update"]);
    expect(updatePublishedHackathon.mock.calls[0][1]).not.toHaveProperty("hnaApproved");
    expect((await response.json()).data.hnaApproved).toBe(true);
  });

  it("saves an un-approval too", async () => {
    await patch({ ...body, hnaApproved: false });

    expect(setHackathonHnaApproved).toHaveBeenCalledWith("h1", false);
  });

  it("leaves the flag alone when the edit does not carry it", async () => {
    await patch(body);

    expect(setHackathonHnaApproved).not.toHaveBeenCalled();
    expect(updatePublishedHackathon).toHaveBeenCalledOnce();
  });
});
