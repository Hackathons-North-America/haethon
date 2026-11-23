"use client";

import { createContext, useContext, useState } from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";

/* The top nav owns an empty center column. A page that has something to put
   there (the hackathon search's region tabs) portals it in, so the page keeps
   the state and handlers while the markup sits in the shared header. */
type AppNavSlotContextValue = {
  slot: HTMLElement | null;
  setSlot: (node: HTMLElement | null) => void;
};

const AppNavSlotContext = createContext<AppNavSlotContextValue | null>(null);

export function AppNavSlotProvider({ children }: { children: ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);

  return <AppNavSlotContext.Provider value={{ slot, setSlot }}>{children}</AppNavSlotContext.Provider>;
}

/** Ref callback for the header's center column. */
export function useAppNavSlotRef() {
  return useContext(AppNavSlotContext)?.setSlot;
}

/**
 * Renders `children` into the top nav's center column. Outside the app shell
 * (no provider) it renders them in place instead, so the caller still works.
 * Inside the shell it renders nothing until the header has mounted.
 */
export function AppNavCenter({ children }: { children: ReactNode }) {
  const context = useContext(AppNavSlotContext);

  if (!context) {
    return <>{children}</>;
  }

  return context.slot ? createPortal(children, context.slot) : null;
}
