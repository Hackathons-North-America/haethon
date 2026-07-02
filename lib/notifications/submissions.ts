import { env } from "@/lib/env";
import { resend } from "@/lib/notifications/resend";

type SubmissionEmailStatus = "received" | "approved" | "merged" | "rejected";

const statusCopy: Record<SubmissionEmailStatus, { subject: string; body: string }> = {
  received: {
    subject: "Hackathon submission received",
    body: "Thanks for sending this in. The submission is now in the review queue.",
  },
  approved: {
    subject: "Hackathon submission approved",
    body: "Your submission has been approved and published.",
  },
  merged: {
    subject: "Hackathon submission merged",
    body: "Your submission matched an existing hackathon and helped update the canonical listing.",
  },
  rejected: {
    subject: "Hackathon submission reviewed",
    body: "Your submission was reviewed but was not published.",
  },
};

export async function sendSubmissionEmail(input: {
  to: string | null | undefined;
  status: SubmissionEmailStatus;
  hackathonName: string;
  reason?: string | null;
  hackathonUrl?: string | null;
}) {
  if (!resend || !env.RESEND_AUDIENCE_FROM || !input.to) {
    return;
  }

  const copy = statusCopy[input.status];
  const lines = [
    copy.body,
    "",
    `Hackathon: ${input.hackathonName}`,
    input.reason ? `Reason: ${input.reason}` : null,
    input.hackathonUrl ? `View it here: ${input.hackathonUrl}` : null,
  ].filter(Boolean);

  await resend.emails.send({
    from: env.RESEND_AUDIENCE_FROM,
    to: input.to,
    subject: copy.subject,
    text: lines.join("\n"),
  });
}
