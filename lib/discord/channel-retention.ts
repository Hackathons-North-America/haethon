export const PAST_DISCORD_CHANNEL_RETENTION_DAYS = 30;

export function discordChannelRetentionCutoff(now: Date) {
  return new Date(now.getTime() - PAST_DISCORD_CHANNEL_RETENTION_DAYS * 24 * 60 * 60 * 1000);
}

/* Past its retention: a channel the cleanup deletes and the sync no longer
   maintains. Recurring series and HNA-approved hackathons keep theirs in the
   archive for the next edition. */
export function isDiscordChannelPastRetention(
  hackathon: { endsAt: Date | null; hnaApproved?: boolean; isRecurring: boolean },
  now = new Date()
) {
  return (
    !hackathon.isRecurring &&
    !hackathon.hnaApproved &&
    hackathon.endsAt !== null &&
    hackathon.endsAt < discordChannelRetentionCutoff(now)
  );
}
