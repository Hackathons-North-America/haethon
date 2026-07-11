"use client";

import { SignOutButton } from "@clerk/nextjs";
import { LogOut } from "lucide-react";

const buttonClassName =
  "inline-flex min-h-9 items-center justify-center gap-2 rounded-full border border-navy/15 dark:border-white/15 bg-white dark:bg-white/[0.06] px-3 text-sm font-semibold text-navy dark:text-wheat transition hover:border-cabernet dark:hover:border-[#e4a3ab]/60 hover:bg-cabernet hover:text-wheat dark:bg-wheat dark:text-[#141414] dark:hover:bg-white focus-visible:bg-cabernet focus-visible:text-wheat focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cabernet dark:focus-visible:outline-wheat";

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
