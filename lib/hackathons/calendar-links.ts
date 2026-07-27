/**
 * Google/Outlook "add event" deep links. Shared by the detail page's
 * AddToCalendarButton and the card's overlay action bar so both produce the
 * same event, with the same title/description shape.
 */
export type CalendarEvent = {
  title: string;
  startsAt: string; // ISO
  endsAt: string; // ISO
  location?: string | null;
  description?: string | null;
  url?: string | null;
};

// Compact UTC form used by Google Calendar: YYYYMMDDTHHMMSSZ
function toCompactUtc(iso: string) {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function buildDetails({ description, url }: Pick<CalendarEvent, "description" | "url">) {
  return [description?.trim(), url ? `More info: ${url}` : null].filter(Boolean).join("\n\n");
}

export function googleCalendarUrl({ title, startsAt, endsAt, location, description, url }: CalendarEvent) {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    dates: `${toCompactUtc(startsAt)}/${toCompactUtc(endsAt)}`,
    details: buildDetails({ description, url }),
    location: location ?? "",
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function outlookCalendarUrl({ title, startsAt, endsAt, location, description, url }: CalendarEvent) {
  const params = new URLSearchParams({
    path: "/calendar/action/compose",
    rru: "addevent",
    subject: title,
    startdt: new Date(startsAt).toISOString(),
    enddt: new Date(endsAt).toISOString(),
    body: buildDetails({ description, url }),
    location: location ?? "",
  });

  return `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`;
}

export function calendarProviderLinks(event: CalendarEvent) {
  return [
    { label: "Google Calendar", href: googleCalendarUrl(event) },
    { label: "Outlook", href: outlookCalendarUrl(event) },
  ];
}
