/* Pure rendering of review-channel messages. No database or Discord calls
   here, so the layout is unit-testable; lib/discord/review-queue.ts loads the
   data and sends what these return. */
import {
  ButtonStyle,
  ComponentType,
  type APIActionRowComponent,
  type APIButtonComponent,
  type APIComponentInMessageActionRow,
  type APIEmbed,
  type APIEmbedField,
} from "discord-api-types/v10";

export type ReviewItemKind = "submission" | "channel_decision" | "import_duplicate";

/* What a review button does. The custom id is `rv:<action>:<item id>`. */
export const REVIEW_ACTIONS = [
  "approve",
  "reject",
  "merge",
  "replace",
  "channel",
  "nochannel",
  "new",
  "dupmerge",
  "skip",
] as const;
export type ReviewAction = (typeof REVIEW_ACTIONS)[number];

export type ReviewSubmissionView = {
  id: string;
  submitterType: "organizer" | "community";
  submitterEmail: string | null;
  organizationName: string | null;
  matchedHackathonId: string | null;
  matchedHackathonName: string | null;
  matchedHackathonSlug: string | null;
  payload: Record<string, unknown>;
  normalizedName: string;
  websiteUrl: string;
  duplicateScore: string | null;
};

export type ReviewItemView = {
  id: string;
  kind: ReviewItemKind;
  status: "pending" | "resolved";
  outcome: string | null;
  resolvedBy: string | null;
  payload: Record<string, unknown> | null;
  submission: ReviewSubmissionView | null;
  /* The hackathon the item is about: the imported one (channel decision), the
     existing match (duplicate), or what a resolved submission became. */
  hackathon: { name: string; slug: string } | null;
};

export const REVIEW_COLORS = {
  pending: 0xf5a623,
  approved: 0x2e7d32,
  rejected: 0xc62828,
  neutral: 0x78909c,
} as const;

export type ReviewMessageBody = {
  allowed_mentions: { parse: [] };
  components: APIActionRowComponent<APIComponentInMessageActionRow>[];
  content: string;
  embeds: APIEmbed[];
};

export function reviewCustomId(action: ReviewAction, itemId: string) {
  return `rv:${action}:${itemId}`;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseReviewCustomId(customId: string): { action: ReviewAction; itemId: string } | null {
  const [prefix, action, itemId, extra] = customId.split(":");

  if (prefix !== "rv" || extra !== undefined || !itemId || !UUID.test(itemId)) {
    return null;
  }

  return (REVIEW_ACTIONS as readonly string[]).includes(action) ? { action: action as ReviewAction, itemId } : null;
}

function clip(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function str(payload: Record<string, unknown> | null | undefined, key: string) {
  const value = payload?.[key];

  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

function formatDay(raw: string) {
  const date = raw ? new Date(raw) : null;

  if (!date || Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleDateString("en-US", { day: "numeric", month: "short", timeZone: "UTC", year: "numeric" });
}

export function dateRangeText(payload: Record<string, unknown> | null) {
  const start = formatDay(str(payload, "startDate"));
  const end = formatDay(str(payload, "endDate"));

  if (!start) {
    return "Not given";
  }

  return end && end !== start ? `${start} – ${end}` : start;
}

export function locationText(payload: Record<string, unknown> | null) {
  const parts = [str(payload, "venue"), str(payload, "city"), str(payload, "region"), str(payload, "country")].filter(Boolean);

  return parts.length ? parts.join(", ") : "Not given";
}

function hackathonLink(appUrl: string, hackathon: { name: string; slug: string }) {
  return `[${hackathon.name.replace(/[[\]]/g, "")}](${appUrl}/hackathons/${hackathon.slug})`;
}

function field(name: string, value: string, inline = true): APIEmbedField {
  return { inline, name, value: clip(value || "—", 1024) };
}

function flagsText(payload: Record<string, unknown> | null) {
  const flags = [
    payload?.beginnerFriendly === true ? "Beginner friendly" : null,
    payload?.travelReimbursement === true ? "Travel reimbursement" : null,
    payload?.highSchoolersOnly === true ? "High school only" : null,
  ].filter(Boolean);

  return flags.join(" · ");
}

function discordSubmitter(payload: Record<string, unknown>) {
  const submitter = payload.discordSubmitter;

  return submitter && typeof submitter === "object" && typeof (submitter as { username?: unknown }).username === "string"
    ? (submitter as { username: string }).username
    : null;
}

function button(
  action: ReviewAction,
  itemId: string,
  label: string,
  emoji: string,
  style: ButtonStyle.Primary | ButtonStyle.Secondary | ButtonStyle.Success | ButtonStyle.Danger
): APIButtonComponent {
  return { custom_id: reviewCustomId(action, itemId), emoji: { name: emoji }, label, style, type: ComponentType.Button };
}

function linkButton(label: string, url: string): APIButtonComponent {
  return { label, style: ButtonStyle.Link, type: ComponentType.Button, url };
}

function row(components: APIButtonComponent[]): APIActionRowComponent<APIComponentInMessageActionRow> {
  return { components, type: ComponentType.ActionRow };
}

function outcomeColor(outcome: string | null) {
  if (!outcome) {
    return REVIEW_COLORS.neutral;
  }

  if (/^(approved|merged|imported|channel|replaced)/i.test(outcome)) {
    return REVIEW_COLORS.approved;
  }

  if (/^rejected/i.test(outcome)) {
    return REVIEW_COLORS.rejected;
  }

  return REVIEW_COLORS.neutral;
}

function submissionEmbed(item: ReviewItemView, submission: ReviewSubmissionView, appUrl: string): APIEmbed {
  const payload = submission.payload;
  const viaDiscord = discordSubmitter(payload);
  const type =
    payload.needsFix === true ? "Import to fix" : submission.submitterType === "organizer" ? "Organizer" : "Community tip";
  const fields: APIEmbedField[] = [
    field("Type", type),
    field("Submitted by", viaDiscord ? `@${viaDiscord} (Discord)` : submission.submitterEmail ?? "Unknown"),
    field("Dates", dateRangeText(payload)),
    field("Location", locationText(payload)),
  ];
  const organization = submission.organizationName ?? str(payload, "organizationName");

  if (organization) {
    fields.push(field("Organization", organization));
  }

  if (str(payload, "discordTag")) {
    fields.push(field("Organizer Discord", `@${str(payload, "discordTag")}`));
  }

  const closes = formatDay(str(payload, "applicationClosesAt"));

  if (closes) {
    fields.push(field("Applications due", closes));
  }

  if (str(payload, "prizeAmountUsd")) {
    fields.push(field("Prize", `$${Number(str(payload, "prizeAmountUsd")).toLocaleString("en-US")} USD`));
  }

  if (flagsText(payload)) {
    fields.push(field("Tags", flagsText(payload), false));
  }

  if (str(payload, "importReason")) {
    fields.push(field("Why it needs a fix", str(payload, "importReason"), false));
  }

  if (submission.matchedHackathonName && submission.matchedHackathonSlug) {
    const score = Number(submission.duplicateScore ?? 0).toFixed(2);

    fields.push(
      field(
        "⚠️ Possible duplicate",
        `${hackathonLink(appUrl, { name: submission.matchedHackathonName, slug: submission.matchedHackathonSlug })} · match ${score}`,
        false
      )
    );
  }

  return {
    color: item.status === "pending" ? REVIEW_COLORS.pending : outcomeColor(item.outcome),
    description: str(payload, "shortDescription") ? clip(str(payload, "shortDescription"), 600) : undefined,
    fields,
    title: clip(submission.normalizedName, 256),
    url: submission.websiteUrl,
  };
}

function channelDecisionEmbed(item: ReviewItemView): APIEmbed {
  const payload = item.payload ?? {};
  const preview = (payload.discord ?? {}) as { action?: string; categoryName?: string; existingChannelName?: string | null; name?: string };
  const plan =
    preview.action === "recycle" && preview.existingChannelName
      ? `Reuse **#${preview.existingChannelName}** in ${preview.categoryName ?? "its category"}`
      : `Create **#${preview.name ?? "a channel"}** in ${preview.categoryName ?? "its category"}`;

  return {
    color: item.status === "pending" ? REVIEW_COLORS.pending : outcomeColor(item.outcome),
    description: `Imported by the scraper and already published. Should it get a Discord channel?\n${plan}`,
    fields: [field("Dates", dateRangeText(payload)), field("Location", locationText(payload))],
    title: clip(`Channel for ${str(payload, "name") || "an imported hackathon"}?`, 256),
    url: str(payload, "websiteUrl") || undefined,
  };
}

function duplicateEmbed(item: ReviewItemView, appUrl: string): APIEmbed {
  const payload = item.payload ?? {};
  const score = Number(str(payload, "duplicateScore") || 0).toFixed(2);
  const existing = item.hackathon ? hackathonLink(appUrl, item.hackathon) : str(payload, "matchedName") || "a deleted hackathon";

  return {
    color: item.status === "pending" ? REVIEW_COLORS.pending : outcomeColor(item.outcome),
    description: `The scraper found this event, but it looks like ${existing} (match ${score}). Nothing was imported.`,
    fields: [
      field("Dates", dateRangeText(payload)),
      field("Location", locationText(payload)),
      field("Source", str(payload, "externalId") || str(payload, "sourceUrl") || "Scraper"),
    ],
    title: clip(`Possible duplicate: ${str(payload, "name") || "Unnamed event"}`, 256),
    url: str(payload, "websiteUrl") || undefined,
  };
}

function pendingButtons(item: ReviewItemView, appUrl: string) {
  if (item.kind === "submission") {
    const buttons = [
      button("approve", item.id, "Approve", "✅", ButtonStyle.Success),
      button("reject", item.id, "Reject", "❌", ButtonStyle.Danger),
    ];

    const needsFix = item.submission?.payload.needsFix === true;
    // A card from the website's import review queue (an upload or the
    // scraper): decided as there, so a possible duplicate is merged or
    // imported as new, never swapped for its match.
    const importCard = item.submission?.payload.origin === "admin_import" && !needsFix;

    if (item.submission?.matchedHackathonId) {
      buttons.push(
        button("merge", item.id, "Merge into match", "🔀", ButtonStyle.Primary),
        importCard
          ? button("new", item.id, "Import as new", "🆕", ButtonStyle.Secondary)
          : button("replace", item.id, "Replace match", "♻️", ButtonStyle.Secondary)
      );
    }

    // Broken scraped imports and import cards have their own queues on the website.
    const queuePath = needsFix ? "/admin/broken" : importCard ? "/admin/import" : "/admin/submissions";
    buttons.push(linkButton("Open queue", `${appUrl}${queuePath}`));

    return [row(buttons)];
  }

  if (item.kind === "channel_decision") {
    const buttons = [
      button("channel", item.id, "Create channel", "✅", ButtonStyle.Success),
      button("nochannel", item.id, "No channel", "❌", ButtonStyle.Danger),
    ];

    if (item.hackathon) {
      buttons.push(linkButton("View hackathon", `${appUrl}/hackathons/${item.hackathon.slug}`));
    }

    return [row(buttons)];
  }

  // Merging needs the match to still exist.
  const buttons = [button("new", item.id, "Import as new", "🆕", ButtonStyle.Success)];

  if (item.hackathon) {
    buttons.push(button("dupmerge", item.id, "Merge into match", "🔀", ButtonStyle.Primary));
  }

  buttons.push(button("skip", item.id, "Skip", "🗑️", ButtonStyle.Secondary));

  if (item.hackathon) {
    buttons.push(linkButton("View match", `${appUrl}/hackathons/${item.hackathon.slug}`));
  }

  return [row(buttons)];
}

/**
 * The full message for one review item. Pending items carry their action
 * buttons; resolved ones lose them, gain a footer saying what happened and
 * who did it, and link to the hackathon when there is one.
 */
export function renderReviewMessage(item: ReviewItemView, appUrl: string): ReviewMessageBody {
  const embed =
    item.kind === "submission" && item.submission
      ? submissionEmbed(item, item.submission, appUrl)
      : item.kind === "channel_decision"
        ? channelDecisionEmbed(item)
        : item.kind === "import_duplicate"
          ? duplicateEmbed(item, appUrl)
          : { color: REVIEW_COLORS.neutral, title: "This submission no longer exists." };

  if (item.status === "resolved") {
    embed.footer = {
      text: clip(`${item.outcome ?? "Resolved"}${item.resolvedBy ? ` · by ${item.resolvedBy}` : ""}`, 2048),
    };
  }

  const components =
    item.status === "pending"
      ? item.kind === "submission" && !item.submission
        ? []
        : pendingButtons(item, appUrl)
      : item.hackathon && item.outcome !== "In progress"
        ? [row([linkButton("View hackathon", `${appUrl}/hackathons/${item.hackathon.slug}`)])]
        : [];

  return { allowed_mentions: { parse: [] }, components, content: "", embeds: [embed] };
}
