import { afterEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({
  handleCallback: vi.fn<(
    handler: (message: unknown, metadata: { topicName: string }) => Promise<void>,
    options: { retry: (error: unknown) => { afterSeconds: number } | undefined }
  ) => void>(),
  send: vi.fn().mockResolvedValue({}),
  drain: vi.fn().mockResolvedValue(0),
  next: vi.fn<() => Promise<number | null>>(),
  fallback: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@vercel/queue", () => ({ handleCallback: calls.handleCallback, send: calls.send }));
vi.mock("@/lib/discord/channel-jobs", () => ({
  drainDiscordChannelJobs: calls.drain,
  drainDiscordChannelJobsSafely: calls.fallback,
  nextDiscordChannelJobAttempt: calls.next,
}));

import { startDiscordChannelJobs } from "@/lib/discord/channel-job-worker";

afterEach(() => vi.unstubAllEnvs());

describe("Discord channel worker", () => {
  it("publishes a wakeup on Vercel without running the Discord job in the approval request", async () => {
    vi.stubEnv("VERCEL", "1");
    await startDiscordChannelJobs();

    expect(calls.send).toHaveBeenCalledWith("discord-channel-jobs", {}, { delaySeconds: 0 });
    expect(calls.fallback).not.toHaveBeenCalled();
  });

  it("asks Vercel to deliver the wakeup again at the recorded retry time", async () => {
    calls.next.mockResolvedValueOnce(540).mockResolvedValueOnce(null);
    const [[handler, { retry }]] = calls.handleCallback.mock.calls;

    const delivery = handler({}, { topicName: "discord-channel-jobs" });
    await expect(delivery).rejects.toThrow("waiting for their next attempt");
    expect(await delivery.catch(retry)).toEqual({ afterSeconds: 540 });

    await expect(handler({}, { topicName: "discord-channel-jobs" })).resolves.toBeUndefined();
    expect(calls.drain).toHaveBeenCalledTimes(2);
  });
});
