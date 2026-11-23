/* Nothing in the side-panel slot unless a hackathon link was intercepted.
   Also what renders here on a hard load, so reloading /hackathons/[slug]
   shows the full page with no panel on top. */
export default function PanelDefault() {
  return null;
}
