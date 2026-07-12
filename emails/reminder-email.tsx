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

export type ReminderEmailProps = {
  greetingName: string;
  hackathonName: string;
  label: string;
  body: string;
  scheduledForLabel: string;
  detailUrl: string;
  pipelineUrl: string;
  unsubscribeUrl?: string;
};

const maroon = "#660000";
const ink = "#1A1A1A";
const muted = "#706F6B";
const border = "#E5E1DC";

const main = {
  backgroundColor: "#EFEDEA",
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji'",
};

const container = {
  margin: "0 auto",
  maxWidth: "520px",
  padding: "32px 0 48px",
};

const card = {
  backgroundColor: "#FFFFFF",
  border: `1px solid ${border}`,
  borderRadius: "12px",
  padding: "32px",
};

const eyebrow = {
  color: maroon,
  fontSize: "12px",
  fontWeight: 600,
  letterSpacing: "0.12em",
  textTransform: "uppercase" as const,
  margin: "0 0 8px",
};

const heading = {
  color: ink,
  fontSize: "22px",
  fontWeight: 600,
  lineHeight: "28px",
  margin: "0 0 16px",
};

const paragraph = {
  color: ink,
  fontSize: "15px",
  lineHeight: "24px",
  margin: "0 0 16px",
};

const meta = {
  color: muted,
  fontSize: "13px",
  lineHeight: "20px",
  margin: "0",
};

const button = {
  backgroundColor: maroon,
  borderRadius: "8px",
  color: "#FFFFFF",
  display: "inline-block",
  fontSize: "14px",
  fontWeight: 600,
  padding: "12px 20px",
  textDecoration: "none",
};

const secondaryLink = {
  color: maroon,
  fontSize: "14px",
  fontWeight: 600,
  textDecoration: "none",
};

const footer = {
  color: muted,
  fontSize: "12px",
  lineHeight: "18px",
  margin: "24px 0 0",
  textAlign: "center" as const,
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
      <Body style={main}>
        <Container style={container}>
          <Section style={card}>
            <Text style={eyebrow}>{label}</Text>
            <Heading style={heading}>{hackathonName}</Heading>
            <Text style={paragraph}>Hey {greetingName},</Text>
            <Text style={paragraph}>{body}</Text>
            <Section style={{ margin: "24px 0" }}>
              <Button href={detailUrl} style={button}>
                View event details
              </Button>
            </Section>
            <Text style={meta}>Scheduled for {scheduledForLabel}</Text>
            <Hr style={{ borderColor: border, margin: "24px 0" }} />
            <Text style={meta}>
              Keeping your status current keeps these reminders accurate.{" "}
              <Link href={pipelineUrl} style={secondaryLink}>
                Open your pipeline
              </Link>
              .
            </Text>
          </Section>
          <Text style={footer}>
            You are receiving this because you saved this hackathon on Haethon.
            {unsubscribeUrl ? (
              <>
                {" "}
                <Link href={unsubscribeUrl} style={{ color: muted, textDecoration: "underline" }}>
                  Unsubscribe from all emails
                </Link>
                .
              </>
            ) : null}
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
