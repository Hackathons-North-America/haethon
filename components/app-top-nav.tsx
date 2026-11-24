"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { useEffect, useId, useRef, useState, type ElementType } from "react";
import {
  Building2,
  CalendarDays,
  CircleUser,
  LogIn,
  Menu,
  PlusSquare,
  Search,
  ShieldCheck,
  UserRound,
} from "lucide-react";

import { useAppNavSlotRef } from "@/components/app-nav-slot";
import { useShellIntro } from "@/components/app-shell-transition";
import { BrandLogo } from "@/components/brand-logo";
import { LoginRequiredLink } from "@/components/login-required-dialog";
import { NavUnderline } from "@/components/nav-underline";
import { ThemeToggle } from "@/components/theme-toggle";
import { useViewerAuth } from "@/components/viewer-auth";
import { isAdminRole } from "@/lib/auth-role";

type NavLink = {
  href: string;
  icon: ElementType;
  label: string;
  requiresAuth?: boolean;
  /** Only the exact path counts as active, not its sub-pages. */
  exact?: boolean;
  /** Menu-only callout text. A link with one renders as a featured block
      between dividers (Airbnb's "Become a host" row) instead of a plain row. */
  description?: string;
};

/* `isSignedIn` is undefined until the browser knows (see useViewerAuth), which
   is also what the static HTML is rendered with. Unknown is shown as signed
   out: a browser with no remembered sign-in has almost certainly never signed
   in here, so the prerendered nav is already right for anonymous visitors
   and only a returning member's nav changes once the page is interactive. */
function buildLinks({
  isAdmin,
  isOrganizer,
  isSignedIn,
}: {
  isAdmin: boolean;
  isOrganizer: boolean;
  isSignedIn: boolean | undefined;
}): NavLink[] {
  return [
    ...(isAdmin ? [{ href: "/admin", icon: ShieldCheck, label: "Admin" }] : []),
    { href: "/hackathons", icon: Search, label: "Search" },
    { href: "/my", icon: CalendarDays, label: "My Hackathons", requiresAuth: true },
    { href: "/account", icon: CircleUser, label: "My Profile", requiresAuth: true, exact: true },
    // Account settings live on the avatar circle, so the menu only needs Login.
    ...(isSignedIn ? [] : [{ href: "/sign-in", icon: LogIn, label: "Login" }]),
    {
      href: "/submit",
      icon: PlusSquare,
      label: "Add a hackathon",
      requiresAuth: true,
      description: "You don't have to be an organizer. Tell us which hackathons we're missing.",
    },
    ...(isOrganizer ? [{ href: "/organizer", icon: Building2, label: "Organizer" }] : []),
  ];
}

/* The active link is the one whose href is the longest matching prefix of the
   current path. An `exact` link only matches itself, so /account/settings
   (reached from the avatar) doesn't highlight My Profile. */
function activeHrefFor(links: NavLink[], pathname: string) {
  return links
    .filter(({ exact, href }) => pathname === href || (!exact && pathname.startsWith(`${href}/`)))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
}

const circleButton =
  "grid size-11 shrink-0 place-items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine";

/* Initial-in-a-circle avatar, like Airbnb's; it opens account settings (the
   profile itself is My Profile in the menu). Signed-out visitors get a person
   glyph that leads to sign-in instead. */
function ProfileCircle({ isSignedIn }: { isSignedIn: boolean | undefined }) {
  const { user } = useUser();
  const initial = (
    user?.firstName?.[0] ??
    user?.username?.[0] ??
    user?.primaryEmailAddress?.emailAddress[0] ??
    ""
  ).toUpperCase();

  if (!isSignedIn) {
    return (
      <Link aria-label="Log in" className={`${circleButton} bg-ink/[0.06] text-ink hover:bg-ink/10`} href="/sign-in">
        <UserRound aria-hidden="true" className="size-5" />
      </Link>
    );
  }

  return (
    <Link
      aria-label="Account settings"
      className={`${circleButton} bg-moss/20 text-[15px] font-semibold text-pine hover:bg-moss/30`}
      href="/account/settings"
    >
      {initial || <UserRound aria-hidden="true" className="size-5" />}
    </Link>
  );
}

/* The ☰ button: a disclosure that drops down every link the old sidebar held,
   plus the light/dark switch at the bottom. */
function NavMenu({
  activeHref,
  isSignedIn,
  links,
}: {
  activeHref?: string;
  isSignedIn: boolean | undefined;
  links: NavLink[];
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        aria-controls={menuId}
        aria-expanded={open}
        aria-label="Menu"
        className={`${circleButton} ${open ? "bg-ink/10" : "bg-ink/[0.06] hover:bg-ink/10"} text-ink`}
        onClick={() => setOpen((current) => !current)}
        ref={buttonRef}
        type="button"
      >
        <Menu aria-hidden="true" className="size-[18px]" strokeWidth={2.2} />
      </button>

      {open ? (
        <nav
          aria-label="Menu"
          className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-64 overflow-hidden rounded-2xl border border-ink/10 bg-surface py-2 shadow-[0_18px_44px_-12px_rgba(27,25,23,0.3)]"
          id={menuId}
        >
          <ul>
            {links.map(({ description, href, icon: Icon, label, requiresAuth }) => {
              const active = href === activeHref;
              const NavigationLink = requiresAuth && !isSignedIn ? LoginRequiredLink : Link;
              /* Only a confirmed signed-out visitor is stopped at the prompt;
                 while the answer is pending the click goes through and the
                 destination's own protection decides. */
              const promptProps = requiresAuth && isSignedIn === false ? { forcePrompt: true } : {};

              if (description) {
                /* Featured row: hairlines above and (unless it's last) below,
                   with an inset like Airbnb's dividers. */
                return (
                  <li
                    className="mx-5 my-2 border-t border-ink/10 pt-2 [&:not(:last-child)]:border-b [&:not(:last-child)]:pb-2"
                    key={href}
                  >
                    <NavigationLink
                      aria-current={active ? "page" : undefined}
                      className="-mx-5 flex flex-col gap-1 px-5 py-3 transition-colors hover:bg-ink/[0.04] focus-visible:bg-ink/[0.04] focus-visible:outline-none"
                      href={href}
                      onClick={() => setOpen(false)}
                      {...promptProps}
                    >
                      <span className={`text-sm font-semibold ${active ? "text-pine" : "text-ink"}`}>{label}</span>
                      <span className="text-xs leading-snug text-ink/55">{description}</span>
                    </NavigationLink>
                  </li>
                );
              }

              return (
                <li key={href}>
                  <NavigationLink
                    aria-current={active ? "page" : undefined}
                    className={`flex min-h-11 items-center gap-3 px-5 text-sm font-medium transition-colors hover:bg-ink/[0.04] focus-visible:bg-ink/[0.04] focus-visible:outline-none ${
                      active ? "text-pine" : "text-ink/75 hover:text-ink"
                    }`}
                    href={href}
                    onClick={() => setOpen(false)}
                    {...promptProps}
                  >
                    <Icon aria-hidden="true" className="size-4 shrink-0" />
                    {label}
                  </NavigationLink>
                </li>
              );
            })}
            {/* Always last, after Organizer too: it is a setting, not a
                page, so it closes out the menu below the link groups. */}
            <li>
              <ThemeToggle className="flex min-h-11 w-full items-center gap-3 px-5 text-left text-sm font-medium text-ink/75 transition-colors hover:bg-ink/[0.04] hover:text-ink focus-visible:bg-ink/[0.04] focus-visible:outline-none" />
            </li>
          </ul>
        </nav>
      ) : null}
    </div>
  );
}

export function AppTopNav() {
  const pathname = usePathname();
  const playsIntro = useShellIntro();
  const slotRef = useAppNavSlotRef();
  /* Read in the browser so the layout (and the static /hackathons page under
     it) never touches the session on the server. The role only decides which
     links are shown; /admin and /organizer check it again themselves. */
  const { isSignedIn, role } = useViewerAuth();
  const links = buildLinks({ isAdmin: isAdminRole(role), isOrganizer: role === "organizer", isSignedIn });
  const activeHref = activeHrefFor(links, pathname);

  return (
    <>
      {/* Airbnb-style header: logo left, the page's center content (region
          tabs on /hackathons) in the middle, actions right. When a page fills
          the center slot it also continues the band below with its own search
          bar and bottom rule, so the header drops its own rule and its paper
          background (the :has()), letting the band's backdrop show through.
          The side columns are minmax(0,1fr) so they always stay equal and the
          center sits on the page's true midline, even when the actions are
          wider than the logo. With the search bar below, the header also
          takes the same 1rem on top that the band leaves above the bar,
          so the row sits midway between the page top and the bar's top. */}
      <header
        className={`relative z-40 border-b border-ink/10 bg-paper has-[[data-nav-slot]:not(:empty)]:border-transparent has-[[data-nav-slot]:not(:empty)]:bg-transparent lg:has-[[data-nav-slot]:not(:empty)]:pt-4 ${
          playsIntro ? "shell-intro-header" : ""
        }`}
      >
        <div className="mx-auto flex max-w-[1800px] flex-wrap items-center justify-between gap-x-4 px-5 sm:px-8 lg:grid lg:min-h-20 lg:has-[[data-nav-slot]:not(:empty)]:min-h-[68px] lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:px-12">
          <Link className="flex min-h-16 items-center justify-self-start" href={isSignedIn ? "/hackathons" : "/"}>
            <BrandLogo />
          </Link>

          {/* Below lg the center content wraps onto its own row; empty, it
              collapses so other pages keep a single-row header. At lg it must
              stay in the grid even when empty, or the actions would slide
              into the middle column. */}
          <div
            className="order-last basis-full empty:hidden lg:order-none lg:basis-auto lg:empty:block"
            data-nav-slot=""
            ref={slotRef}
          />

          <div className="flex items-center gap-2 justify-self-end">
            <LoginRequiredLink
              className="group hidden min-h-11 items-center whitespace-nowrap rounded-full px-4 text-[15px] font-semibold text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine sm:inline-flex lg:max-[1079px]:hidden"
              href="/submit"
            >
              <span className="relative">
                Add a hackathon
                <NavUnderline />
              </span>
            </LoginRequiredLink>
            <ProfileCircle isSignedIn={isSignedIn} />
            <NavMenu activeHref={activeHref} isSignedIn={isSignedIn} links={links} />
          </div>
        </div>
      </header>

      {/* Phone tab bar: fixed to the bottom so it survives scrolling, padded for
          the home-indicator inset, every tab sharing the width evenly. */}
      <nav
        aria-label="App navigation"
        className={`fixed inset-x-0 bottom-0 z-50 border-t border-ink/15 bg-paper pb-[env(safe-area-inset-bottom)] lg:hidden ${
          playsIntro ? "shell-intro-tab-bar" : ""
        }`}
      >
        <ul className="flex items-stretch">
          {links.map(({ href, icon: Icon, label, requiresAuth }) => {
            const active = href === activeHref;
            const NavigationLink = requiresAuth && !isSignedIn ? LoginRequiredLink : Link;

            return (
              <li className="flex-1" key={href}>
                <NavigationLink
                  aria-current={active ? "page" : undefined}
                  aria-label={label}
                  className="flex h-14 items-center justify-center focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-pine"
                  href={href}
                  {...(requiresAuth && isSignedIn === false ? { forcePrompt: true } : {})}
                >
                  <Icon
                    aria-hidden="true"
                    className={`size-6 transition-colors ${active ? "text-pine" : "text-ink/45"}`}
                    strokeWidth={active ? 2.4 : 1.8}
                  />
                </NavigationLink>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
