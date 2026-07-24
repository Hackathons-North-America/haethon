/**
 * Image URLs are fetched and verified before they are stored. Read paths return
 * that stored HTTPS URL directly: no database-backed proxy, DNS validation, or
 * second server-side image fetch is performed when a logo is displayed.
 */
export function hackathonLogoSrc(_hackathonId: string, imageUrl: string) {
  return imageUrl;
}
