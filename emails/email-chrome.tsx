import type { ReactNode } from "react";

import { Link, Section, Text } from "@react-email/components";

import { emailStyles } from "@/emails/email-theme";

/**
 * The espresso header band both templates open with: the landing hero's
 * grained bark panel cropped to a strip, carrying the wordmark in cream. Kept
 * here rather than duplicated so the reminder and the digest always ship the
 * same masthead.
 */
export function EmailHeader() {
  return (
    <>
      <div aria-hidden="true" style={emailStyles.accentBar}>
        &nbsp;
      </div>
      <Section style={emailStyles.headerBand}>
        <div style={emailStyles.headerInner}>
          <Text style={emailStyles.headerBrand}>
            HNA{" "}
            <span style={emailStyles.headerDescriptor}>
              / Hackathons North America
            </span>
          </Text>
        </div>
      </Section>
    </>
  );
}

/**
 * The closing block: why this landed, the unsubscribe escape hatch, and the
 * mono sign-off that matches the site footer's voice.
 */
export function EmailFooter({
  children,
  unsubscribeUrl,
}: {
  children: ReactNode;
  unsubscribeUrl: string;
}) {
  return (
    <>
      <Text style={emailStyles.footer}>
        {children}
        <br />
        <Link href={unsubscribeUrl} style={emailStyles.unsubscribeLink}>
          Unsubscribe from all emails
        </Link>
      </Text>
      <Text style={emailStyles.footerMark}>Hackathons North America</Text>
    </>
  );
}
