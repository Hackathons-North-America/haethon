import { render } from "@react-email/render";

import { ReminderEmail } from "@/emails/reminder-email";
import { formatReminderDate, reminderTypeLabels } from "@/lib/hackathons/reminder-labels";

/**
 * The message body shown for each reminder type. Only the types the planner
 * currently schedules have copy; anything else falls back to its label.
 */
const reminderBodies: Record<string, string> = {
  application_open: "Applications are open. Grab a spot before the rush.",
  application_week_before: "Applications open in a week. Line up your team and idea so you're ready to apply.",
  application_day_before: "Applications open tomorrow. Have your details ready and apply before the rush.",
  hackathon_week_before: "The event starts in a week. Time to sort travel, teammates, and ideas.",
  hackathon_day_before: "The event starts tomorrow. Do a final check on travel, check-in, and gear.",
};

export type BuildReminderEmailInput = {
  type: string;
  firstName?: string | null;
  hackathonName: string;
  hackathonSlug: string;
  scheduledFor: Date;
  appUrl: string;
  unsubscribeUrl?: string;
};

/**
 * Render a reminder email once, returning the subject plus the HTML and plain
 * text bodies. The cron and the admin test endpoint both go through here so a
 * test send is byte-for-byte what a hacker would receive.
 */
export async function buildReminderEmail(input: BuildReminderEmailInput) {
  const label = reminderTypeLabels[input.type] ?? input.type;
  const body = reminderBodies[input.type] ?? label;
  const detailUrl = `${input.appUrl}/hackathons/${input.hackathonSlug}`;
  const pipelineUrl = `${input.appUrl}/my`;

  const element = (
    <ReminderEmail
      body={body}
      detailUrl={detailUrl}
      greetingName={input.firstName ?? "hacker"}
      hackathonName={input.hackathonName}
      label={label}
      pipelineUrl={pipelineUrl}
      scheduledForLabel={formatReminderDate(input.scheduledFor)}
      unsubscribeUrl={input.unsubscribeUrl}
    />
  );

  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);

  return {
    subject: `${label} · ${input.hackathonName}`,
    html,
    text,
  };
}
