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

export type CountryAlertEmailHackathon = {
  name: string;
  location: string;
  dateRange: string;
  detailUrl: string;
};

export type CountryAlertEmailProps = {
  greetingName: string;
  country: string;
  frequencyLabel: string;
  hackathons: CountryAlertEmailHackathon[];
  browseUrl: string;
  manageUrl: string;
  unsubscribeUrl: string;
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

const hackathonRow = {
  border: `1px solid ${border}`,
  borderRadius: "10px",
  margin: "0 0 12px",
  padding: "16px 18px",
};

const hackathonName = {
  color: ink,
  fontSize: "16px",
  fontWeight: 600,
  lineHeight: "22px",
  margin: "0 0 4px",
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

const unsubscribeButton = {
  border: `1px solid ${muted}`,
  borderRadius: "8px",
  color: muted,
  display: "inline-block",
  fontSize: "12px",
  fontWeight: 600,
  marginTop: "12px",
  padding: "8px 14px",
  textDecoration: "none",
};

export function CountryAlertEmail({
  greetingName,
  country,
  frequencyLabel,
  hackathons,
  browseUrl,
  manageUrl,
  unsubscribeUrl,
}: CountryAlertEmailProps) {
  const intro =
    hackathons.length === 1
      ? `A new hackathon in ${country} just landed in the database.`
      : `${hackathons.length} new hackathons in ${country} just landed in the database.`;

  return (
    <Html>
      <Head />
      <Preview>{intro}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={card}>
            <Text style={eyebrow}>{`${frequencyLabel} · ${country}`}</Text>
            <Heading style={heading}>
              {hackathons.length === 1 ? "New hackathon in your country" : "New hackathons in your country"}
            </Heading>
            <Text style={paragraph}>Hey {greetingName},</Text>
            <Text style={paragraph}>{intro}</Text>
            {hackathons.map((hackathon) => (
              <Section key={hackathon.detailUrl} style={hackathonRow}>
                <Text style={hackathonName}>
                  <Link href={hackathon.detailUrl} style={{ color: ink, textDecoration: "none" }}>
                    {hackathon.name}
                  </Link>
                </Text>
                <Text style={meta}>
                  {hackathon.location} · {hackathon.dateRange}
                </Text>
              </Section>
            ))}
            <Section style={{ margin: "24px 0" }}>
              <Button href={browseUrl} style={button}>
                Browse the Hackathons DB
              </Button>
            </Section>
            <Hr style={{ borderColor: border, margin: "24px 0" }} />
            <Text style={meta}>
              Want a different country or cadence?{" "}
              <Link href={manageUrl} style={secondaryLink}>
                Manage your country alert
              </Link>
              .
            </Text>
          </Section>
          <Text style={footer}>
            You are receiving this because you set a country alert for {country} on Haethon.
          </Text>
          <Section style={{ textAlign: "center" }}>
            <Button href={unsubscribeUrl} style={unsubscribeButton}>
              Unsubscribe from all emails
            </Button>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
