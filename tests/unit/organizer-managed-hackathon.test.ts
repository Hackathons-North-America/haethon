// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/* getManagedHackathon's authorization, with the database stubbed: the row
   read and canManageHackathon() (the check the organizer API routes run) are
   mocked, so these tests pin down how the two are combined. */
const hackathonId = "5f0c1a52-3d4b-4e8f-9a61-2b7c8d9e0f11";

const row = {
  id: hackathonId,
  name: "MapleHacks",
  startsAt: new Date("2026-09-12T00:00:00.000Z"),
  endsAt: new Date("2026-09-14T00:00:00.000Z"),
  applicationOpensAt: null,
  applicationClosesAt: new Date("2026-08-01T00:00:00.000Z"),
  acceptanceAt: null,
};

const canManageHackathon = vi.fn<(input: { userId: string; role: string; hackathonId: string }) => Promise<boolean>>(async () => true);
const rowQuery = vi.fn(async () => [row] as (typeof row)[]);
const adminHackathonQuery = vi.fn(() => ({
  where: () => ({ limit: rowQuery }),
}));

vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/hackathons/admin-service", () => ({ adminHackathonQuery }));
vi.mock("@/lib/hackathons/checkin-service", () => ({ canManageHackathon }));

const { getManagedHackathon } = await import("@/lib/hackathons/organizer-service");

beforeEach(() => {
  vi.clearAllMocks();
  canManageHackathon.mockResolvedValue(true);
  rowQuery.mockResolvedValue([row]);
});

describe("getManagedHackathon", () => {
  it("returns the serialized row when the user may manage it", async () => {
    const item = await getManagedHackathon({ userId: "u1", role: "organizer", hackathonId });

    expect(canManageHackathon).toHaveBeenCalledWith({ userId: "u1", role: "organizer", hackathonId });
    expect(item).toMatchObject({
      id: hackathonId,
      startsAt: "2026-09-12T00:00:00.000Z",
      endsAt: "2026-09-14T00:00:00.000Z",
      applicationOpensAt: null,
      applicationClosesAt: "2026-08-01T00:00:00.000Z",
    });
  });

  it("returns null when the organizer does not manage the hackathon", async () => {
    canManageHackathon.mockResolvedValue(false);

    await expect(getManagedHackathon({ userId: "u1", role: "organizer", hackathonId })).resolves.toBeNull();
  });

  it("returns null when the hackathon does not exist", async () => {
    rowQuery.mockResolvedValue([]);

    await expect(getManagedHackathon({ userId: "u1", role: "admin", hackathonId })).resolves.toBeNull();
  });

  it("delegates admins to the shared check, which allows them any hackathon", async () => {
    await expect(getManagedHackathon({ userId: "a1", role: "admin", hackathonId })).resolves.not.toBeNull();
    expect(canManageHackathon).toHaveBeenCalledWith({ userId: "a1", role: "admin", hackathonId });
  });

  it("rejects regular users without touching the database", async () => {
    await expect(getManagedHackathon({ userId: "u2", role: "user", hackathonId })).resolves.toBeNull();
    expect(canManageHackathon).not.toHaveBeenCalled();
    expect(adminHackathonQuery).not.toHaveBeenCalled();
  });

  it("treats an id that isn't a uuid as not found instead of querying", async () => {
    await expect(getManagedHackathon({ userId: "a1", role: "admin", hackathonId: "not-a-uuid" })).resolves.toBeNull();
    expect(adminHackathonQuery).not.toHaveBeenCalled();
  });
});
