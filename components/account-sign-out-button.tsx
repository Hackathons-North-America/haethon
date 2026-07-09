"use client";

import { SignOutButton } from "@clerk/nextjs";
import { LogOut } from "lucide-react";

const buttonClassName =
  "inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-black/15 bg-white px-3 text-sm font-semibold text-black transition hover:border-[#660000] hover:bg-[#660000] hover:text-white focus-visible:bg-[#660000] focus-visible:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#660000]";

export function AccountSignOutButton() {
  return (
    <SignOutButton redirectUrl="/">
      <button className={buttonClassName} type="button">
        <LogOut aria-hidden="true" className="size-4" />
        Sign out
      </button>
    </SignOutButton>
  );
}
