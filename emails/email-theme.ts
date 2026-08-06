import type { CSSProperties } from "react";

/**
 * Email-safe equivalents of the product's paper, ink, and bark design tokens.
 * Keep these as literal values because email clients cannot reliably resolve
 * the CSS custom properties used by the web app. Mirror any change to the
 * matching token in app/globals.css.
 */
export const emailColors = {
  paper: "#FBF7F0",
  ink: "#1B1917",
  pine: "#362519",
  moss: "#6B4A30",
  mutedInk: "#6E6A66",
  border: "#D9D4CE",
  pineWash: "#EDE5DD",

  /* Landing-hero tones. `bark` is the same value as `pine` — the token exists
     so hero surfaces read as an intentional ground rather than an accent.
     `barkLight` is the warm high end of the panel's tonal blooms, `cream` the
     card face that floats on the paper ground, and `creamMuted` the tan a
     descriptor takes when it sits on bark instead of paper. */
  bark: "#362519",
  barkLight: "#7A5637",
  cream: "#FFFDFA",
  creamMuted: "#C9B7A6",
  wash: "#F6F0E7",
  borderSoft: "#E4DDD4",
} as const;

const sans =
  "Geist, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji'";
const mono =
  "'Geist Mono', 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace";

/**
 * The hero panel's tonal blooms (see BARK_BLOOMS in components/hero-split.tsx),
 * re-aimed at a short wide band instead of a full-height column: warm light
 * gathers at the top-left, a second pool answers it on the right, and shadow
 * sinks out of the bottom edge. Earlier layers paint over later ones.
 *
 * Every surface that uses this also sets a flat `backgroundColor`, because
 * Outlook's Word engine drops `background-image` outright and would otherwise
 * render the band transparent.
 */
const BARK_BLOOMS = [
  "radial-gradient(74% 160% at 14% -10%, rgba(134, 94, 61, 0.6), transparent 68%)",
  "radial-gradient(58% 130% at 86% 4%, rgba(104, 71, 46, 0.45), transparent 70%)",
  "radial-gradient(96% 140% at 52% 122%, rgba(18, 11, 7, 0.45), transparent 76%)",
].join(", ");

/**
 * The hackathon cards' streak grain, with its opacity baked into the SVG
 * because email has no `mix-blend-mode`. Carried on its own element rather
 * than stacked into the band's background layers: Gmail strips data-URI
 * backgrounds, and a shared declaration would take the blooms down with it.
 */
export const emailGrainUri =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)' opacity='0.12'/%3E%3C/svg%3E\")";

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

  /* ————— Header: the landing hero's espresso panel, cropped to a band. ————— */

  /* The drafting rule that opens the sheet, ruled in the panel's own tones so
     it reads as the top edge of the bark rather than a separate accent. */
  accentBar: {
    backgroundColor: emailColors.moss,
    backgroundImage: `linear-gradient(90deg, ${emailColors.barkLight} 0%, ${emailColors.bark} 55%, ${emailColors.moss} 100%)`,
    borderRadius: "14px 14px 0 0",
    fontSize: "1px",
    height: "4px",
    lineHeight: "4px",
    width: "100%",
  },
  headerBand: {
    backgroundColor: emailColors.bark,
    backgroundImage: BARK_BLOOMS,
    width: "100%",
  },
  /* Padding lives here, not on the band, so the grain covers the full surface
     instead of just the text block. */
  headerInner: {
    backgroundImage: emailGrainUri,
    backgroundSize: "140px 140px",
    padding: "26px 32px 28px",
  },
  headerBrand: {
    color: emailColors.paper,
    fontSize: "20px",
    fontWeight: 700,
    letterSpacing: "-0.03em",
    margin: "0",
  },
  headerDescriptor: {
    color: emailColors.creamMuted,
    fontFamily: mono,
    fontSize: "10px",
    fontWeight: 500,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  },

  /* ————— Body card: paper stock under the band. ————— */

  card: {
    backgroundColor: emailColors.cream,
    border: `1px solid ${emailColors.borderSoft}`,
    borderRadius: "0 0 14px 14px",
    borderTop: "none",
    /* Tables are content-box by default, so without this the bordered card
       would sit 2px wider than the header band above it. */
    boxSizing: "border-box",
    padding: "32px",
    width: "100%",
  },
  /* The reminder type, set as a warm chip instead of bare text — the brown
     highlight the section eyebrows carry on the site. */
  eyebrow: {
    backgroundColor: emailColors.pineWash,
    backgroundImage: `linear-gradient(90deg, ${emailColors.pineWash} 0%, ${emailColors.wash} 100%)`,
    borderRadius: "999px",
    color: emailColors.pine,
    display: "inline-block",
    fontFamily: mono,
    fontSize: "11px",
    fontWeight: 500,
    letterSpacing: "0.1em",
    margin: "0 0 14px",
    padding: "6px 12px",
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
    borderBottom: `1px solid ${emailColors.borderSoft}`,
    color: emailColors.moss,
    fontFamily: mono,
    fontSize: "11px",
    fontWeight: 500,
    letterSpacing: "0.1em",
    margin: "28px 0 12px",
    paddingBottom: "8px",
    textTransform: "uppercase",
  },
  /* Digest rows: a warm wash sweeping in from the left edge, the way the
     landing sections tint their panels off a hairline. */
  itemRow: {
    backgroundColor: emailColors.cream,
    backgroundImage: `linear-gradient(90deg, ${emailColors.wash} 0%, ${emailColors.cream} 62%)`,
    border: `1px solid ${emailColors.borderSoft}`,
    borderRadius: "10px",
    boxSizing: "border-box",
    margin: "0 0 10px",
    padding: "15px 16px",
    width: "100%",
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
    backgroundImage: `linear-gradient(90deg, ${emailColors.pineWash} 0%, ${emailColors.cream} 100%)`,
    borderLeft: `3px solid ${emailColors.bark}`,
    borderRadius: "0 10px 10px 0",
    boxSizing: "border-box",
    margin: "22px 0 0",
    padding: "12px 14px",
    width: "100%",
  },
  dateLabel: {
    color: emailColors.moss,
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
  /* The hero's CTA pill, inverted: bark ground lit from the top the way the
     panel is, with the flat bark left as the Outlook fallback. */
  button: {
    backgroundColor: emailColors.bark,
    backgroundImage: `linear-gradient(180deg, ${emailColors.barkLight} 0%, ${emailColors.bark} 62%, #2A1C12 100%)`,
    borderRadius: "999px",
    color: emailColors.paper,
    display: "inline-block",
    fontSize: "14px",
    fontWeight: 600,
    padding: "13px 22px",
    textDecoration: "none",
  },
  secondaryLink: {
    color: emailColors.moss,
    fontSize: "13px",
    fontWeight: 600,
    textDecoration: "underline",
    textDecorationColor: emailColors.moss,
    textUnderlineOffset: "3px",
  },
  divider: {
    borderColor: emailColors.borderSoft,
    margin: "26px 0 22px",
  },
  footer: {
    color: emailColors.mutedInk,
    fontSize: "12px",
    lineHeight: "18px",
    margin: "22px 0 0",
    textAlign: "center",
  },
  footerMark: {
    color: emailColors.moss,
    fontFamily: mono,
    fontSize: "10px",
    fontWeight: 500,
    letterSpacing: "0.16em",
    margin: "24px 0 0",
    textAlign: "center",
    textTransform: "uppercase",
  },
  unsubscribeLink: {
    color: emailColors.mutedInk,
    fontSize: "12px",
    fontWeight: 600,
    textDecoration: "underline",
    textUnderlineOffset: "3px",
  },
} satisfies Record<string, CSSProperties>;
