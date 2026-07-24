import type { CSSProperties } from "react";

/**
 * Email-safe equivalents of the product's paper, ink, and pine design tokens.
 * Keep these as literal values because email clients cannot reliably resolve
 * the CSS custom properties used by the web app.
 */
export const emailColors = {
  paper: "#FBF7F0",
  ink: "#1B1917",
  pine: "#007354",
  moss: "#00A071",
  mutedInk: "#6E6A66",
  border: "#D9D4CE",
  pineWash: "#E2ECE5",
} as const;

const sans =
  "Geist, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji'";
const mono =
  "'Geist Mono', 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace";

export const emailStyles = {
  main: {
    backgroundColor: emailColors.paper,
    color: emailColors.ink,
    fontFamily: sans,
    margin: "0",
  },
  container: {
    boxSizing: "border-box",
    margin: "0 auto",
    maxWidth: "560px",
    padding: "32px 16px 48px",
    width: "100%",
  },
  brand: {
    color: emailColors.ink,
    fontSize: "19px",
    fontWeight: 700,
    letterSpacing: "-0.03em",
    margin: "0 0 18px",
  },
  brandDescriptor: {
    color: emailColors.mutedInk,
    fontFamily: mono,
    fontSize: "10px",
    fontWeight: 500,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  },
  card: {
    backgroundColor: emailColors.paper,
    border: `1px solid ${emailColors.border}`,
    padding: "32px",
  },
  eyebrow: {
    color: emailColors.pine,
    fontFamily: mono,
    fontSize: "11px",
    fontWeight: 500,
    letterSpacing: "0.1em",
    margin: "0 0 10px",
    textTransform: "uppercase",
  },
  heading: {
    color: emailColors.ink,
    fontSize: "28px",
    fontWeight: 500,
    letterSpacing: "-0.035em",
    lineHeight: "33px",
    margin: "0 0 22px",
  },
  paragraph: {
    color: emailColors.ink,
    fontSize: "15px",
    lineHeight: "24px",
    margin: "0 0 16px",
  },
  sectionTitle: {
    color: emailColors.pine,
    fontFamily: mono,
    fontSize: "11px",
    fontWeight: 500,
    letterSpacing: "0.1em",
    margin: "28px 0 12px",
    textTransform: "uppercase",
  },
  itemRow: {
    border: `1px solid ${emailColors.border}`,
    margin: "0 0 10px",
    padding: "15px 16px",
  },
  itemName: {
    color: emailColors.ink,
    fontSize: "15px",
    fontWeight: 600,
    letterSpacing: "-0.01em",
    lineHeight: "21px",
    margin: "0 0 4px",
  },
  meta: {
    color: emailColors.mutedInk,
    fontSize: "13px",
    lineHeight: "20px",
    margin: "0",
  },
  datePanel: {
    backgroundColor: emailColors.pineWash,
    borderLeft: `3px solid ${emailColors.pine}`,
    margin: "22px 0 0",
    padding: "12px 14px",
  },
  dateLabel: {
    color: emailColors.pine,
    fontFamily: mono,
    fontSize: "10px",
    fontWeight: 500,
    letterSpacing: "0.08em",
    margin: "0 0 3px",
    textTransform: "uppercase",
  },
  dateValue: {
    color: emailColors.ink,
    fontSize: "14px",
    fontWeight: 600,
    lineHeight: "20px",
    margin: "0",
  },
  button: {
    backgroundColor: emailColors.pine,
    borderRadius: "999px",
    color: emailColors.paper,
    display: "inline-block",
    fontSize: "14px",
    fontWeight: 600,
    padding: "12px 20px",
    textDecoration: "none",
  },
  secondaryLink: {
    color: emailColors.pine,
    fontSize: "13px",
    fontWeight: 600,
    textDecoration: "underline",
    textDecorationColor: emailColors.moss,
    textUnderlineOffset: "3px",
  },
  divider: {
    borderColor: emailColors.border,
    margin: "26px 0 22px",
  },
  footer: {
    color: emailColors.mutedInk,
    fontSize: "12px",
    lineHeight: "18px",
    margin: "22px 0 0",
    textAlign: "center",
  },
  unsubscribeLink: {
    color: emailColors.mutedInk,
    fontSize: "12px",
    fontWeight: 600,
    textDecoration: "underline",
    textUnderlineOffset: "3px",
  },
} satisfies Record<string, CSSProperties>;
