/* The /add-hackathon form, with the same fields as the web form on /submit.
   Hacker mode is the web form's "Community" tab (name + link); organizer mode
   is its "Organizer" tab. A Discord pop-up holds five fields, so organizer
   mode is three pop-ups and a final message for the checkboxes, with the
   answers kept in a draft between them. Pure: no database or Discord calls. */
import {
  ButtonStyle,
  ComponentType,
  type APIActionRowComponent,
  type APIComponentInMessageActionRow,
  type APIEmbed,
} from "discord-api-types/v10";

import { issuesText, normalizeDateInput, normalizeUrlInput, type FormInput } from "@/lib/discord/form-fields";
import { dateRangeText, locationText } from "@/lib/discord/review-messages";
import { COMMUNITY_FORM_SOURCE_URL } from "@/lib/hackathons/source-provenance";
import {
  communitySubmissionSchema,
  organizerSubmissionFieldsSchema,
  organizerSubmissionSchema,
} from "@/lib/validations/hackathon";

export const COMMAND_NAME = "add-hackathon";

export const COMMUNITY_FIELDS: FormInput[] = [
  { id: "name", label: "Event name", maxLength: 180, minLength: 3, required: true },
  { id: "websiteUrl", label: "Website", maxLength: 500, placeholder: "No link? Put www.example.com", required: true },
];

export const ORGANIZER_STEPS = [
  {
    fields: [
      { id: "name", label: "Event name", maxLength: 180, minLength: 3, required: true },
      { id: "organizationName", label: "Organization", maxLength: 160, minLength: 2, required: true },
      { id: "websiteUrl", label: "Website URL", maxLength: 500, placeholder: "www.example.com", required: true },
      {
        id: "discordTag",
        label: "Organizer Discord",
        maxLength: 33,
        minLength: 2,
        placeholder: "username of one organizer hackers can ping with questions",
        required: true,
      },
      { id: "shortDescription", label: "Short description", maxLength: 500, minLength: 20, paragraph: true, required: true },
    ],
    key: "basics",
    label: "Basics",
    title: "Add your hackathon (1 of 4)",
  },
  {
    fields: [
      { id: "startDate", label: "Start date", maxLength: 10, minLength: 8, placeholder: "YYYY-MM-DD", required: true },
      { id: "endDate", label: "End date", maxLength: 10, minLength: 8, placeholder: "YYYY-MM-DD", required: true },
      { id: "applicationOpensAt", label: "Application opens", maxLength: 10, placeholder: "YYYY-MM-DD (optional)" },
      { id: "applicationClosesAt", label: "Application due date", maxLength: 10, placeholder: "YYYY-MM-DD (optional)" },
    ],
    key: "dates",
    label: "Dates",
    title: "Dates (2 of 4)",
  },
  {
    fields: [
      { id: "city", label: "City", maxLength: 120 },
      { id: "region", label: "Province / state", maxLength: 120 },
      { id: "country", label: "Country", maxLength: 120, minLength: 2, required: true },
      { id: "venue", label: "Venue", maxLength: 160 },
      { id: "prizeAmountUsd", label: "Prize amount USD", maxLength: 12, placeholder: "e.g. 5000 (optional)" },
    ],
    key: "location",
    label: "Location & prize",
    title: "Location & prize (3 of 4)",
  },
] as const satisfies ReadonlyArray<{ key: string; label: string; title: string; fields: FormInput[] }>;

export type OrganizerStepKey = (typeof ORGANIZER_STEPS)[number]["key"];

export const ORGANIZER_FLAGS = [
  { label: "Beginner friendly", value: "beginnerFriendly" },
  { label: "Travel reimbursement", value: "travelReimbursement" },
  { label: "High school only", value: "highSchoolersOnly" },
] as const;

export type OrganizerDraft = {
  /* What was typed in each pop-up, as typed. */
  steps: Partial<Record<OrganizerStepKey, Record<string, string>>>;
  /* Pop-ups whose answers passed their checks. */
  done: OrganizerStepKey[];
  flags: string[];
};

export function emptyDraft(): OrganizerDraft {
  return { done: [], flags: [], steps: {} };
}

export function asDraft(data: Record<string, unknown> | null | undefined): OrganizerDraft {
  const steps = (data?.steps ?? {}) as OrganizerDraft["steps"];
  const done = Array.isArray(data?.done) ? (data.done as OrganizerStepKey[]) : [];
  const flags = Array.isArray(data?.flags) ? (data.flags as string[]) : [];

  return { done, flags, steps };
}

export function isOrganizerStep(value: string): value is OrganizerStepKey {
  return ORGANIZER_STEPS.some((step) => step.key === value);
}

export function organizerStep(key: OrganizerStepKey) {
  return ORGANIZER_STEPS.find((step) => step.key === key)!;
}

/* The pop-ups' custom ids: `ah:m:<step>:<draft id or "new">`, and `ah:m:c` for hacker mode. */
export const COMMUNITY_MODAL_ID = "ah:m:c";

export function organizerModalId(step: OrganizerStepKey, draftId: string | null) {
  return `ah:m:${step}:${draftId ?? "new"}`;
}

/* A Discord username prefilled as the organizer contact. Legacy names with a
   #1234 tag cannot be pinged by username, so they are left out. */
export function defaultDiscordTag(username: string) {
  return /^[a-z0-9_.]{2,32}$/.test(username) ? username : "";
}

function prizeValue(raw: string | undefined) {
  return (raw ?? "").replace(/[$,\s]/g, "").replace(/usd$/i, "");
}

/* Typed values in the shape the web form posts. Dates typed in the wrong
   shape become "not a date" so the schema rejects them by name. */
function stepValues(key: OrganizerStepKey, typed: Record<string, string> = {}) {
  if (key === "basics") {
    return {
      discordTag: typed.discordTag ?? "",
      name: typed.name ?? "",
      organizationName: typed.organizationName ?? "",
      shortDescription: typed.shortDescription ?? "",
      websiteUrl: normalizeUrlInput(typed.websiteUrl),
    };
  }

  if (key === "dates") {
    const date = (field: string) => {
      const value = normalizeDateInput(typed[field]);

      return value === null ? "not a date" : value;
    };

    return {
      applicationClosesAt: date("applicationClosesAt"),
      applicationOpensAt: date("applicationOpensAt"),
      endDate: date("endDate"),
      startDate: date("startDate"),
    };
  }

  return {
    city: typed.city ?? "",
    country: typed.country ?? "",
    prizeAmountUsd: prizeValue(typed.prizeAmountUsd),
    region: typed.region ?? "",
    venue: typed.venue ?? "",
  };
}

const STEP_SCHEMAS = {
  basics: organizerSubmissionFieldsSchema.pick({
    discordTag: true,
    name: true,
    organizationName: true,
    shortDescription: true,
    websiteUrl: true,
  }),
  dates: organizerSubmissionFieldsSchema
    .pick({ applicationClosesAt: true, applicationOpensAt: true, endDate: true, startDate: true })
    .refine((dates) => dates.endDate >= dates.startDate, { message: "End date must be on or after the start date.", path: ["endDate"] }),
  location: organizerSubmissionFieldsSchema.pick({ city: true, country: true, prizeAmountUsd: true, region: true, venue: true }),
};

/* Problems with one pop-up's answers, as bullet text, or null when they pass. */
export function validateOrganizerStep(key: OrganizerStepKey, typed: Record<string, string> | undefined) {
  const parsed = STEP_SCHEMAS[key].safeParse(stepValues(key, typed));

  return parsed.success ? null : issuesText(parsed.error);
}

/* The whole organizer submission, exactly as the web form would post it. */
export function organizerSubmissionInput(draft: OrganizerDraft) {
  return organizerSubmissionSchema.safeParse({
    ...stepValues("basics", draft.steps.basics),
    ...stepValues("dates", draft.steps.dates),
    ...stepValues("location", draft.steps.location),
    beginnerFriendly: draft.flags.includes("beginnerFriendly"),
    // Only in-person hackathons are listed, so the format is fixed (as on the web form).
    format: "in_person",
    highSchoolersOnly: draft.flags.includes("highSchoolersOnly"),
    submitterType: "organizer",
    travelReimbursement: draft.flags.includes("travelReimbursement"),
  });
}

export function communitySubmissionInput(typed: Record<string, string>) {
  return communitySubmissionSchema.safeParse({
    name: typed.name ?? "",
    sourceUrl: COMMUNITY_FORM_SOURCE_URL,
    submitterType: "community",
    websiteUrl: normalizeUrlInput(typed.websiteUrl),
  });
}

export function nextOrganizerStep(draft: OrganizerDraft) {
  return ORGANIZER_STEPS.find((step) => !draft.done.includes(step.key)) ?? null;
}

function stepSummary(key: OrganizerStepKey, draft: OrganizerDraft) {
  const typed = draft.steps[key] ?? {};

  if (key === "basics") {
    return [typed.name, typed.organizationName, normalizeUrlInput(typed.websiteUrl), typed.discordTag ? `@${typed.discordTag.replace(/^@+/, "")}` : ""]
      .filter(Boolean)
      .join("\n");
  }

  if (key === "dates") {
    const values = stepValues("dates", typed);
    const due = values.applicationClosesAt && values.applicationClosesAt !== "not a date" ? `\nApplications due ${values.applicationClosesAt}` : "";

    return `${dateRangeText(values)}${due}`;
  }

  const prize = prizeValue(typed.prizeAmountUsd);

  return `${locationText(typed)}${prize ? `\n$${prize} USD prize` : ""}`;
}

/**
 * The private message that walks an organizer through the form: what is
 * filled in so far, the next pop-up to open, and at the end the checkboxes
 * and the submit button. `error` explains what to fix.
 */
export function organizerProgressMessage(draftId: string, draft: OrganizerDraft, error?: string | null) {
  const next = nextOrganizerStep(draft);
  const doneCount = draft.done.length;
  const embed: APIEmbed = {
    color: error ? 0xc62828 : 0x2e7d32,
    description: error
      ? `⚠️ Fix these, then continue:\n${error}`.slice(0, 4096)
      : next
        ? `Step ${doneCount + 1} of 4: ${next.label}. Your answers are saved as you go.`
        : "Step 4 of 4: tick what applies, then submit. The Haethon team reviews it before it goes live.",
    fields: ORGANIZER_STEPS.filter((step) => draft.done.includes(step.key)).map((step) => ({
      name: step.label,
      value: (stepSummary(step.key, draft) || "—").slice(0, 1024),
    })),
    title: "Add your hackathon",
  };
  const editButtons = ORGANIZER_STEPS.filter((step) => draft.steps[step.key] && step.key !== next?.key).map((step) => ({
    custom_id: `ah:open:${step.key}:${draftId}`,
    label: `Edit ${step.label.toLowerCase()}`,
    style: ButtonStyle.Secondary as const,
    type: ComponentType.Button as const,
  }));
  const cancel = { custom_id: `ah:cancel:${draftId}`, label: "Cancel", style: ButtonStyle.Danger as const, type: ComponentType.Button as const };
  const components: APIActionRowComponent<APIComponentInMessageActionRow>[] = [];

  if (next) {
    components.push({
      components: [
        {
          custom_id: `ah:open:${next.key}:${draftId}`,
          label: draft.steps[next.key] ? `Fix: ${next.label}` : `Continue: ${next.label}`,
          style: ButtonStyle.Primary,
          type: ComponentType.Button,
        },
        ...editButtons,
        cancel,
      ],
      type: ComponentType.ActionRow,
    });
  } else {
    components.push(
      {
        components: [
          {
            custom_id: `ah:flags:${draftId}`,
            max_values: ORGANIZER_FLAGS.length,
            min_values: 0,
            options: ORGANIZER_FLAGS.map((flag) => ({ default: draft.flags.includes(flag.value), label: flag.label, value: flag.value })),
            placeholder: "Beginner friendly, travel reimbursement, high school only…",
            type: ComponentType.StringSelect,
          },
        ],
        type: ComponentType.ActionRow,
      },
      {
        components: [
          { custom_id: `ah:submit:${draftId}`, label: "Submit for review", style: ButtonStyle.Success, type: ComponentType.Button },
          ...editButtons,
          cancel,
        ],
        type: ComponentType.ActionRow,
      }
    );
  }

  return { allowed_mentions: { parse: [] as [] }, components, content: "", embeds: [embed] };
}
