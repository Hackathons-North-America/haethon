/* Pure helpers for Discord pop-up forms (modals): building them, reading what
   was typed, and turning validation errors into text a person can act on.
   Shared by /add-hackathon and the review channel's "fill in" pop-ups. */
import {
  ComponentType,
  InteractionResponseType,
  TextInputStyle,
  type APIModalInteractionResponse,
  type APITextInputComponent,
} from "discord-api-types/v10";
import type { z } from "zod";

/* The labels the web form uses, so an error names "Start date", not "startDate". */
export const FIELD_LABELS: Record<string, string> = {
  name: "Event name",
  organizationName: "Organization",
  websiteUrl: "Website URL",
  sourceUrl: "Source URL",
  discordTag: "Organizer Discord",
  shortDescription: "Short description",
  startDate: "Start date",
  endDate: "End date",
  applicationOpensAt: "Application opens",
  applicationClosesAt: "Application due date",
  city: "City",
  region: "Province / state",
  country: "Country",
  venue: "Venue",
  prizeAmountUsd: "Prize amount USD",
  format: "Format",
};

export type FormInput = {
  id: string;
  label: string;
  required?: boolean;
  paragraph?: boolean;
  placeholder?: string;
  minLength?: number;
  maxLength?: number;
};

/* Discord's limits: a modal title is at most 45 characters, a label 45, a
   placeholder 100, and a modal holds at most five inputs. */
export function modalResponse(input: {
  customId: string;
  title: string;
  fields: FormInput[];
  values?: Record<string, string | undefined>;
}): APIModalInteractionResponse {
  if (input.fields.length > 5) {
    throw new Error("A Discord modal holds at most five inputs.");
  }

  return {
    data: {
      components: input.fields.map((field) => {
        const value = input.values?.[field.id]?.slice(0, field.maxLength ?? 4000);
        const textInput: APITextInputComponent = {
          custom_id: field.id,
          label: field.label.slice(0, 45),
          max_length: field.maxLength,
          min_length: field.minLength,
          placeholder: field.placeholder?.slice(0, 100),
          required: field.required ?? false,
          style: field.paragraph ? TextInputStyle.Paragraph : TextInputStyle.Short,
          type: ComponentType.TextInput,
        };

        if (value) {
          textInput.value = value;
        }

        return { components: [textInput], type: ComponentType.ActionRow };
      }),
      custom_id: input.customId,
      title: input.title.slice(0, 45),
    },
    type: InteractionResponseType.Modal,
  };
}

type SubmittedComponent = {
  component?: SubmittedComponent;
  components?: SubmittedComponent[];
  custom_id?: string;
  value?: string;
};

/**
 * Every typed value of a submitted modal, by input id. Walks the tree
 * because Discord nests inputs in action rows (classic) or in labels (newer
 * layouts), and both can arrive.
 */
export function modalValues(components: SubmittedComponent[] | undefined): Record<string, string> {
  const values: Record<string, string> = {};

  const visit = (component: SubmittedComponent) => {
    if (component.custom_id && typeof component.value === "string") {
      values[component.custom_id] = component.value;
    }

    component.components?.forEach(visit);

    if (component.component) {
      visit(component.component);
    }
  };

  components?.forEach(visit);

  return values;
}

/* As the web form does: a bare domain gets https:// so "www.example.com" is accepted. */
export function normalizeUrlInput(value: string | undefined) {
  const trimmed = value?.trim() ?? "";

  return !trimmed || /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

/**
 * A typed date as YYYY-MM-DD, "" when left empty, or null when it is not a
 * real date in that shape. Only YYYY-MM-DD is accepted: "01/02/2027" reads
 * as January or February depending on who typed it.
 */
export function normalizeDateInput(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? "";

  if (!trimmed) {
    return "";
  }

  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(trimmed);

  if (!match) {
    return null;
  }

  const [, year, month, day] = match;
  const iso = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  const date = new Date(`${iso}T00:00:00Z`);

  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== iso ? null : iso;
}

/* A stored date (ISO string) as the YYYY-MM-DD a pop-up shows. */
export function dateInputValue(value: unknown) {
  if (typeof value !== "string" || !value) {
    return "";
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function friendlyIssue(issue: z.core.$ZodIssue) {
  if (issue.code === "invalid_type" && issue.expected === "date") {
    return "Use YYYY-MM-DD, e.g. 2027-01-16.";
  }

  if (issue.code === "too_small" && issue.origin === "string") {
    return Number(issue.minimum) <= 1 ? "Required." : `At least ${issue.minimum} characters.`;
  }

  if (issue.code === "invalid_type" && /received undefined/.test(issue.message)) {
    return "Required.";
  }

  return issue.message;
}

/* One bullet per broken field, labelled as on the web form. */
export function issuesText(error: z.ZodError) {
  const lines = new Map<string, string>();

  for (const issue of error.issues) {
    const key = issue.path.filter((segment) => typeof segment === "string").at(-1) as string | undefined;
    const label = key ? (FIELD_LABELS[key] ?? key) : "Form";

    if (!lines.has(label)) {
      lines.set(label, friendlyIssue(issue));
    }
  }

  return [...lines].map(([label, message]) => `• **${label}:** ${message}`).join("\n");
}
