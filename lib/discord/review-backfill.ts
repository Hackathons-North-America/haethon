import { listChannelDecisionCards } from "@/lib/discord/channel-decisions";
import { channelDecisionItem, type NewReviewItem } from "@/lib/discord/review-items";
import { listImportCards } from "@/lib/hackathons/import-queue";

/**
 * Everything waiting on the website that the Discord review channel should
 * also show: each card in the import review queue, and each hackathon waiting
 * for its Discord channel decision. Most are posted the moment they appear
 * (the import routes); this covers the rest, such as a hackathon published on
 * /admin/import whose channel prompt was closed unanswered, and what waited
 * before the review channel existed. Queueing is idempotent per item (kind
 * plus key), and an item already decided is not listed, so this is safe to
 * run on every daily sync.
 */
export async function waitingWebsiteReviewItems(): Promise<NewReviewItem[]> {
  const [cards, channels] = await Promise.all([listImportCards(), listChannelDecisionCards()]);

  return [
    ...cards.map((card): NewReviewItem => ({ dedupeKey: card.id, kind: "submission", submissionId: card.id })),
    ...channels.map((channel) => channelDecisionItem(channel.hackathonId, channel.payload, channel.discord)),
  ];
}
