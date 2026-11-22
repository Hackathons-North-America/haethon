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

/* Bare status words read oddly next to a name ("James is applied"), so each
   stage gets its own phrase for the friend-activity surfaces. */
export const friendStatusPhrases: Record<string, string> = {
  interested: "is interested",
  applied: "has applied",
  attending: "is attending",
  attended: "attended",
  won: "won here",
};
