import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";

import { emailStyles } from "@/emails/email-theme";

export type ReminderEmailProps = {
  greetingName: string;
  hackathonName: string;
  label: string;
  body: string;
  scheduledForLabel: string;
  detailUrl: string;
  pipelineUrl: string;
  unsubscribeUrl: string;
};

export function ReminderEmail({
  greetingName,
  hackathonName,
  label,
  body,
  scheduledForLabel,
  detailUrl,
  pipelineUrl,
  unsubscribeUrl,
}: ReminderEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>{`${hackathonName}: ${body}`}</Preview>
      <Body style={emailStyles.main}>
        <Container style={emailStyles.container}>
          <Text style={emailStyles.brand}>
            HNA{" "}
            <span style={emailStyles.brandDescriptor}>
              / Hackathons North America
            </span>
          </Text>
          <Section style={emailStyles.card}>
            <Text style={emailStyles.eyebrow}>{label}</Text>
            <Heading style={emailStyles.heading}>{hackathonName}</Heading>
            <Text style={emailStyles.paragraph}>Hey {greetingName},</Text>
            <Text style={emailStyles.paragraph}>{body}</Text>
            <Section style={{ margin: "24px 0" }}>
              <Button href={detailUrl} style={emailStyles.button}>
                View event details
              </Button>
            </Section>
            <Section style={emailStyles.datePanel}>
              <Text style={emailStyles.dateLabel}>Scheduled for</Text>
              <Text style={emailStyles.dateValue}>{scheduledForLabel}</Text>
            </Section>
            <Hr style={emailStyles.divider} />
            <Text style={emailStyles.meta}>
              Keeping your status current keeps these reminders accurate.{" "}
              <Link href={pipelineUrl} style={emailStyles.secondaryLink}>
                Open your pipeline
              </Link>
              .
            </Text>
          </Section>
          <Text style={emailStyles.footer}>
            You are receiving this because you saved this hackathon on Haethon.
            <br />
            <Link href={unsubscribeUrl} style={emailStyles.unsubscribeLink}>
              Unsubscribe from all emails
            </Link>
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
