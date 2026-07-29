import { z } from "zod";

import { isProfileUsername, PROFILE_USERNAME_MAX_LENGTH } from "@/lib/profile/username";

export const followRequestSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .max(PROFILE_USERNAME_MAX_LENGTH)
    .refine(isProfileUsername, "Enter a valid profile username."),
});

export const followDecisionSchema = z.object({
  action: z.enum(["approve", "reject"]),
});
