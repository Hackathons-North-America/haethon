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

import { EmailFooter, EmailHeader } from "@/emails/email-chrome";
import { emailColors, emailStyles } from "@/emails/email-theme";

export type WeeklyDigestReminderItem = {
  hackathonName: string;
  /* Date-based headline, e.g. "Applications open Jul 23, 2026" — digest items
     land up to two weeks ahead, so relative wording like "in a week" would lie. */
  headline: string;
  detailUrl: string;
};

export type WeeklyDigestCountryItem = {
  name: string;
  location: string;
  dateRange: string;
  detailUrl: string;
};

export type WeeklyDigestEmailProps = {
  greetingName: string;
  reminderItems: WeeklyDigestReminderItem[];
  country: string | null;
  countryItems: WeeklyDigestCountryItem[];
  browseUrl: string;
  pipelineUrl: string;
  unsubscribeUrl: string;
};

export function WeeklyDigestEmail({
  greetingName,
  reminderItems,
  country,
  countryItems,
  browseUrl,
  pipelineUrl,
  unsubscribeUrl,
}: WeeklyDigestEmailProps) {
  const updateCount = reminderItems.length + countryItems.length;
  const intro =
    updateCount === 1
      ? "One update for your week ahead."
      : `${updateCount} updates for your week ahead.`;

  return (
    <Html>
      <Head>
        {/* The palette is warm and light by design; opting out of automatic
            dark-mode inversion keeps the bark band from being re-tinted. */}
        <meta name="color-scheme" content="light" />
        <meta name="supported-color-schemes" content="light" />
      </Head>
      <Preview>{intro}</Preview>
      <Body style={emailStyles.main}>
        <Container style={emailStyles.container}>
          <EmailHeader />
          <Section style={emailStyles.card}>
            <Text style={emailStyles.eyebrow}>Weekly digest</Text>
            <Heading style={emailStyles.heading}>Your week ahead</Heading>
            <Text style={emailStyles.paragraph}>Hey {greetingName},</Text>
            <Text style={emailStyles.paragraph}>{intro}</Text>

            {reminderItems.length ? (
              <>
                <Text style={emailStyles.sectionTitle}>Coming up</Text>
                {reminderItems.map((item) => (
                  <Section key={`${item.detailUrl}:${item.headline}`} style={emailStyles.itemRow}>
                    <Text style={emailStyles.itemName}>
                      <Link href={item.detailUrl} style={{ color: emailColors.ink, textDecoration: "none" }}>
                        {item.hackathonName}
                      </Link>
                    </Text>
                    <Text style={emailStyles.meta}>{item.headline}</Text>
                  </Section>
                ))}
              </>
            ) : null}

            {country && countryItems.length ? (
              <>
                <Text style={emailStyles.sectionTitle}>New in {country}</Text>
                {countryItems.map((item) => (
                  <Section key={item.detailUrl} style={emailStyles.itemRow}>
                    <Text style={emailStyles.itemName}>
                      <Link href={item.detailUrl} style={{ color: emailColors.ink, textDecoration: "none" }}>
                        {item.name}
                      </Link>
                    </Text>
                    <Text style={emailStyles.meta}>
                      {item.location} · {item.dateRange}
                    </Text>
                  </Section>
                ))}
              </>
            ) : null}

            <Section style={{ margin: "24px 0" }}>
              <Button href={reminderItems.length ? pipelineUrl : browseUrl} style={emailStyles.button}>
                {reminderItems.length ? "Open your pipeline" : "Browse the Hackathons DB"}
              </Button>
            </Section>
            <Hr style={emailStyles.divider} />
            <Text style={emailStyles.meta}>
              Keeping your status current keeps these digests accurate.{" "}
              <Link href={pipelineUrl} style={emailStyles.secondaryLink}>
                Open your pipeline
              </Link>
              .
            </Text>
          </Section>
          <EmailFooter unsubscribeUrl={unsubscribeUrl}>
            You are receiving this weekly digest because of your saved hackathons and alerts on Haethon.
          </EmailFooter>
        </Container>
      </Body>
    </Html>
  );
}
