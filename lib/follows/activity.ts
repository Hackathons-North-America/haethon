/* Client-safe follow types and copy. Kept free of db imports so components
   (which reach client bundles and unit tests) can use them without dragging
   in the database client and its env validation. */

/* Serializable, so it can ride card payloads into client components. */
export type HackathonFriend = {
  username: string;
  name: string;
  imageUrl: string | null;
  status: string;
};

/* "attending" reads oddly next to a name ("James is attending in…"), so each
   stage gets its own phrase for the friend-activity surfaces. */
export const friendStatusPhrases: Record<string, string> = {
  interested: "is interested",
  applied: "has applied",
  accepted: "was accepted",
  attending: "is going",
  attended: "attended",
  won: "won here",
};
