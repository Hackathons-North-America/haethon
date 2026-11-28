import Link from "next/link";
import { ArrowLeft, SearchX } from "lucide-react";

import { cardClassName, primaryButtonClassName } from "@/components/organizer/detail/shared";

/* Shown when the id is malformed, the hackathon doesn't exist, or the
   signed-in organizer doesn't manage it. The copy doesn't distinguish those
   cases, so it never confirms that someone else's hackathon exists. */
export default function OrganizerHackathonNotFound() {
  return (
    <div className={`${cardClassName} mx-auto max-w-xl px-5 py-10 text-center sm:px-8 sm:py-12`}>
      <span className="mx-auto grid size-12 place-items-center rounded-full bg-pine-soft text-pine">
        <SearchX aria-hidden="true" className="size-6" />
      </span>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight text-ink">This hackathon isn&apos;t in your console</h1>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-ink/55">
        It may have been removed, or your account isn&apos;t one of its organizers. Pick one of your hackathons
        from the list instead.
      </p>
      <Link className={`${primaryButtonClassName} mt-6`} href="/organizer">
        <ArrowLeft aria-hidden="true" className="size-4" />
        All hackathons
      </Link>
    </div>
  );
}
