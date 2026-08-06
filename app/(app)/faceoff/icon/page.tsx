import type { Metadata } from "next";
import { headers } from "next/headers";
import { auth } from "@clerk/nextjs/server";

import { IconFaceoff } from "@/components/icon-faceoff";
import { getMatchupSplits, getSettledMatchups } from "@/lib/faceoff/icon-service";
import { peekFaceoffVoter } from "@/lib/hackathons/faceoff-voter";

export const metadata: Metadata = {
  title: "Icon Face Off | Hackathons North America",
  description:
    "Two tech icons, one pick. Vote for the founder you would rather have in your corner and watch the split move.",
};

export default async function IconFaceOffPage() {
  const [{ userId }, requestHeaders] = await Promise.all([auth(), headers()]);
  /* Peek rather than resolve: a page render cannot set the cookie a freshly
     minted anonymous id would need, so an unrecognised visitor simply starts
     with no ballots on file and gets their id from the vote request. */
  const fingerprint = await peekFaceoffVoter(userId, requestHeaders);
  const [splits, settledKeys] = await Promise.all([
    getMatchupSplits(),
    getSettledMatchups(fingerprint),
  ]);

  return <IconFaceoff initialSplits={splits} settledKeys={settledKeys} />;
}
