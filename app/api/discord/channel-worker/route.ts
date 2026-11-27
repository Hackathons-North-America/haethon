import { consumeDiscordChannelJobs } from "@/lib/discord/channel-job-worker";

export const maxDuration = 60;
export const POST = consumeDiscordChannelJobs;
