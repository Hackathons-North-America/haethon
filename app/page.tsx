import Link from "next/link";
import Image from "next/image";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  Bell,
  Building2,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  Maximize2,
  Megaphone,
  Search,
  Trophy,
} from "lucide-react";

import { NavAuthLink } from "@/components/nav-auth-link";
import { HeroTypewriterSpan } from "@/components/hero-typewriter-span";

const navItems = [
  { label: "About", href: "#about" },
  { label: "FQA", href: "#fqa" },
  { label: "Submit", href: "/submit" },
  { label: "Hackathons", href: "/hackathons" },
];

const navLinkClassName =
  "decoration-[#660000] decoration-1 underline-offset-6 hover:text-[#660000] hover:underline focus-visible:text-[#660000] focus-visible:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#660000]";

const loginLinkClassName =
  "inline-flex min-h-9 items-center justify-center border border-[#660000] px-4 text-[#660000] transition-colors hover:bg-[#660000] hover:text-white focus-visible:bg-[#660000] focus-visible:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#660000]";

const hackathonPlaceholders = [
  "Hackathon 01",
  "Hackathon 02",
  "Hackathon 03",
  "Hackathon 04",
  "Hackathon 05",
  "Hackathon 06",
  "Hackathon 07",
  "Hackathon 08",
];

const audienceCards = [
  {
    title: "Hacker",
    icon: Search,
  },
  {
    title: "Organizer",
    icon: ClipboardList,
  },
  {
    title: "Corporations/business",
    icon: Building2,
  },
];

const heroCommunityMembers = [
  {
    id: 1,
    name: "John Doe",
    designation: "Software Engineer",
    image:
      "https://images.unsplash.com/photo-1599566150163-29194dcaad36?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=3387&q=80",
  },
  {
    id: 2,
    name: "Robert Johnson",
    designation: "Product Manager",
    image:
      "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8Mnx8YXZhdGFyfGVufDB8fDB8fHww&auto=format&fit=crop&w=800&q=60",
  },
  {
    id: 3,
    name: "Jane Smith",
    designation: "Data Scientist",
    image:
      "https://images.unsplash.com/photo-1580489944761-15a19d654956?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8NXx8YXZhdGFyfGVufDB8fDB8fHww&auto=format&fit=crop&w=800&q=60",
  },
  {
    id: 4,
    name: "Emily Davis",
    designation: "UX Designer",
    image:
      "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MTB8fGF2YXRhcnxlbnwwfHwwfHx8MA%3D%3D&auto=format&fit=crop&w=800&q=60",
  },
  {
    id: 5,
    name: "Tyler Durden",
    designation: "Soap Developer",
    image:
      "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=3540&q=80",
  },
  {
    id: 6,
    name: "Dora",
    designation: "The Explorer",
    image:
      "https://images.unsplash.com/photo-1544725176-7c40e5a71c5e?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=3534&q=80",
  },
];

type HeroDecoration = {
  name: string;
  Icon: LucideIcon;
  className: string;
  badgeClassName: string;
  sizeClassName?: string;
  iconClassName?: string;
  notification?: string;
  marks?: "arc" | "bits" | "spark" | "zigzag";
};

const heroDecorations: HeroDecoration[] = [
  {
    name: "deadline calendar",
    Icon: CalendarDays,
    className: "-left-3 -top-4 rotate-[-12deg] xl:-left-[4.75rem]",
    badgeClassName: "bg-[#FFD166]",
    sizeClassName: "size-16",
    notification: "3",
    marks: "arc",
  },
  {
    name: "winner",
    Icon: Trophy,
    className: "-left-2 bottom-[1%] rotate-[8deg] xl:-left-[5rem]",
    badgeClassName: "bg-[#FFB64D]",
    sizeClassName: "size-16",
  },
  {
    name: "reminder",
    Icon: Bell,
    className: "bottom-[-7%] left-[20%] rotate-[-10deg]",
    badgeClassName: "bg-[#E8E3DA]",
    sizeClassName: "size-11",
    iconClassName: "text-[#3F3E3B]",
    notification: "1",
  },
  {
    name: "submission checklist",
    Icon: ClipboardCheck,
    className: "-right-4 top-0 rotate-[3deg] xl:-right-[5rem]",
    badgeClassName: "bg-[#C99BFF]",
    sizeClassName: "size-16",
    notification: "2",
  },
  {
    name: "event search",
    Icon: Search,
    className: "-right-14 top-[29%] rotate-[-11deg] xl:-right-[5.75rem]",
    badgeClassName: "bg-[#F4F1EA]",
    sizeClassName: "size-12",
    iconClassName: "text-[#3F3E3B]",
  },
  {
    name: "sponsor call",
    Icon: Megaphone,
    className: "right-[3%] bottom-[6%] rotate-[-8deg] xl:-right-[4.25rem]",
    badgeClassName: "bg-[#F178CE]",
    sizeClassName: "size-14",
  },
];

function HeroMotionMarks({ type }: { type: NonNullable<HeroDecoration["marks"]> }) {
  if (type === "arc") {
    return (
      <svg
        aria-hidden="true"
        className="absolute -left-14 -top-8 h-12 w-24 -rotate-6 text-[#3F3E3B]"
        fill="none"
        viewBox="0 0 96 48"
      >
        <path
          d="M6 33C25 10 55 6 86 23"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="2.4"
        />
        <path
          d="M16 38C34 22 58 19 80 31"
          opacity="0.38"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="2"
        />
      </svg>
    );
  }

  if (type === "bits") {
    return (
      <svg
        aria-hidden="true"
        className="absolute -right-9 -top-3 h-11 w-11 rotate-12"
        fill="none"
        viewBox="0 0 44 44"
      >
        <rect fill="#2F80ED" height="8" rx="2" width="8" x="6" y="19" />
        <rect fill="#34A853" height="8" rx="2" width="8" x="18" y="26" />
        <rect fill="#FFCC4D" height="8" rx="2" width="8" x="19" y="10" />
        <rect fill="#FF3B30" height="8" rx="2" width="8" x="30" y="18" />
      </svg>
    );
  }

  if (type === "spark") {
    return (
      <svg
        aria-hidden="true"
        className="absolute -right-7 -top-8 h-8 w-8 text-[#3F3E3B]"
        fill="currentColor"
        viewBox="0 0 32 32"
      >
        <path d="M12 3l2.1 6.2L20 12l-5.9 2.8L12 21l-2.1-6.2L4 12l5.9-2.8L12 3Z" />
        <path d="M24 15l1.2 3.4L29 20l-3.8 1.6L24 25l-1.2-3.4L19 20l3.8-1.6L24 15Z" />
      </svg>
    );
  }

  return (
    <svg
      aria-hidden="true"
      className="absolute -right-12 -top-7 h-14 w-16 text-[#3F3E3B]"
      fill="none"
      viewBox="0 0 64 56"
    >
      <path
        d="M9 38c12-4 7-20 23-22"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2.4"
      />
      <path
        d="M38 9c-5 8-3 15 9 20"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2.4"
      />
    </svg>
  );
}

function HeroIconSticker({ decoration }: { decoration: HeroDecoration }) {
  const {
    Icon,
    badgeClassName,
    className,
    iconClassName = "text-black",
    marks,
    notification,
    sizeClassName = "size-14",
  } = decoration;

  return (
    <div className={`absolute ${className}`}>
      {marks ? <HeroMotionMarks type={marks} /> : null}
      <div
        className={`relative grid place-items-center rounded-full border-2 border-white shadow-[0_12px_32px_rgba(0,0,0,0.16)] ${sizeClassName} ${badgeClassName}`}
      >
        <Icon
          aria-hidden="true"
          className={`size-[46%] ${iconClassName}`}
          strokeWidth={2.35}
        />
        {notification ? (
          <span className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-[#FF3B30] text-[10px] font-semibold leading-none text-white shadow-[0_2px_8px_rgba(255,59,48,0.32)]">
            {notification}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function HeroIconCloud() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-y-0 left-0 right-0 z-0 hidden lg:block"
    >
      {heroDecorations.map((decoration) => (
        <HeroIconSticker decoration={decoration} key={decoration.name} />
      ))}
    </div>
  );
}

function HeroCommunityInlineStack() {
  return (
    <span
      aria-hidden="true"
      className="mx-2 inline-flex translate-y-[0.08em] items-center align-middle sm:mx-3"
    >
      {heroCommunityMembers.map((person, index) => (
        <span
          className="relative -mr-[0.45rem] inline-flex last:mr-0 sm:-mr-[0.6rem]"
          key={person.id}
          style={{ zIndex: heroCommunityMembers.length - index }}
        >
          <span className="relative block size-[1.8rem] overflow-hidden rounded-full border-2 border-white bg-[#F8F8F4] shadow-[0_8px_18px_rgba(0,0,0,0.16)] sm:size-[2.1rem]">
            <Image
              alt=""
              className="h-full w-full object-cover"
              height={34}
              sizes="(min-width: 640px) 34px, 29px"
              src={person.image}
              width={34}
            />
          </span>
        </span>
      ))}
    </span>
  );
}

function CompanyLogoStrip({ hidden = false }: { hidden?: boolean }) {
  return (
    <svg
      aria-hidden={hidden}
      aria-label={
        hidden
          ? undefined
          : "Placeholder company logo strip with Google, Microsoft, Tailscale, Backboard.io, GitHub, Warp, PCBWay, 1Password, and Perplexity"
      }
      className="h-auto w-[1588px] shrink-0"
      fill="none"
      role={hidden ? undefined : "img"}
      viewBox="0 0 1588 46"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g fill="#3F3E3B" fontFamily="Arial, Helvetica, sans-serif">
        <text fontSize="24" fontWeight="700" x="16" y="32">
          Google
        </text>
        <circle cx="122" cy="25" fill="#706F6B" r="3" />
        <text fontSize="24" fontWeight="700" x="166" y="32">
          Microsoft
        </text>
        <circle cx="314" cy="25" fill="#706F6B" r="3" />
        <text fontSize="24" fontWeight="700" x="358" y="32">
          Tailscale
        </text>
        <circle cx="492" cy="25" fill="#706F6B" r="3" />
        <text fontSize="24" fontWeight="700" x="536" y="32">
          Backboard.io
        </text>
        <circle cx="708" cy="25" fill="#706F6B" r="3" />
        <text fontSize="24" fontWeight="700" x="752" y="32">
          GitHub
        </text>
        <circle cx="858" cy="25" fill="#706F6B" r="3" />
        <text fontSize="24" fontWeight="700" x="902" y="32">
          Warp
        </text>
        <circle cx="990" cy="25" fill="#706F6B" r="3" />
        <text fontSize="24" fontWeight="700" x="1034" y="32">
          PCBWay
        </text>
        <circle cx="1160" cy="25" fill="#706F6B" r="3" />
        <text fontSize="24" fontWeight="700" x="1204" y="32">
          1Password
        </text>
        <circle cx="1366" cy="25" fill="#706F6B" r="3" />
        <text fontSize="24" fontWeight="700" x="1410" y="32">
          Perplexity
        </text>
        <circle cx="1572" cy="25" fill="#706F6B" r="3" />
      </g>
    </svg>
  );
}

function HackathonNameStrip({ hidden = false }: { hidden?: boolean }) {
  return (
    <div
      aria-hidden={hidden}
      className="flex shrink-0 items-center gap-8 whitespace-nowrap pr-8 text-lg font-semibold text-[#3F3E3B]"
    >
      {hackathonPlaceholders.map((hackathon) => (
        <span key={hackathon} className="inline-flex items-center gap-8">
          {hackathon}
          <span
            aria-hidden="true"
            className="size-1 rounded-full bg-[#706F6B]"
          />
        </span>
      ))}
    </div>
  );
}

export default function Home() {
  return (
    <main className="min-h-screen overflow-hidden bg-white text-black">
      <nav
        aria-label="Primary navigation"
        className="border-b border-black/10 bg-white px-8 font-mono text-xs font-medium uppercase tracking-[0.14em] text-[#706F6B] sm:px-14 lg:px-20"
      >
        <div className="mx-auto flex min-h-20 max-w-[1120px] flex-col items-start justify-center gap-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:py-0">
          <Link
            href="/"
            className={`${navLinkClassName} font-serif text-xl font-semibold normal-case leading-none tracking-normal text-black sm:text-2xl`}
          >
            Hackathons North America
          </Link>

          <div className="flex flex-wrap items-center justify-start gap-x-5 gap-y-3 sm:justify-end sm:gap-x-8">
            {navItems.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className={navLinkClassName}
              >
                {item.label}
              </Link>
            ))}
            <NavAuthLink className={loginLinkClassName} />
          </div>
        </div>
      </nav>

      <section className="relative isolate min-h-[calc(100vh-68px)] overflow-hidden bg-white px-8 pb-[4.5rem] pt-24 sm:px-14 sm:pb-[5.5rem] sm:pt-32 md:pb-28 md:pt-44 lg:px-20">
        <div className="relative z-10 mx-auto max-w-[1120px]">
          <div className="grid items-end gap-8 md:grid-cols-[minmax(0,1fr)_auto]">
            <div>
              <h1
                aria-label="Search hundreds of upcoming hackathons, build your profile, and never miss another application deadline."
                className="max-w-[1120px] text-[2.15rem] font-semibold leading-[1.08] tracking-normal text-black sm:text-[2.65rem] lg:text-[2.75rem]"
              >
                <span className="block">Search hundreds of upcoming</span>{" "}
                <span className="block">
                  <span className="inline-flex items-baseline">
                    <span>hackathons</span>
                    <HeroCommunityInlineStack />
                    <span>,</span>
                  </span>
                  {" "}
                  build your profile,
                </span>{" "}
                <span className="block">
                  and <HeroTypewriterSpan />
                </span>
              </h1>
              <p className="mt-8 max-w-[640px] text-base leading-6 text-[#706F6B]">
                Filter for hackathons by location, date, and category, track
                your achievements, and stay informed with reminders for
                deadlines and upcoming events.
              </p>
            </div>

            <Link
              href="/hackathons"
              className="inline-flex w-fit items-center gap-3 justify-self-start text-sm font-medium text-[#706F6B] hover:text-[#660000] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#660000]/35 md:mb-1 md:justify-self-end"
            >
              <span>Browse events</span>
              <ArrowRight
                aria-hidden="true"
                className="h-4 w-4"
                strokeWidth={1.75}
              />
            </Link>
          </div>

          <div className="relative mt-16 sm:mt-20">
            <HeroIconCloud />
            <div className="relative z-10 mx-auto h-[74vh] max-h-[760px] min-h-[520px] w-full overflow-hidden rounded-xl border border-black/15 bg-white shadow-[0_34px_110px_rgba(0,0,0,0.14)] sm:min-h-[600px] lg:min-h-[650px]">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_35%_10%,_rgba(102,0,0,0.05),_rgba(255,255,255,0)_34%)]" />
              <div className="relative grid h-full grid-cols-[18%_1fr_25%] text-[12px] text-[#706F6B]">
                <aside className="border-r border-black/10 bg-[#F8F8F4]/95">
                  <div className="flex h-12 items-center gap-2 border-b border-black/10 px-5">
                    <span
                      aria-hidden="true"
                      className="grid size-4 place-items-center rounded-full bg-[#660000]"
                    >
                      <span className="block size-2.5 rounded-full bg-[linear-gradient(45deg,_#fff_0_18%,_transparent_18%_30%,_#fff_30%_48%,_transparent_48%_60%,_#fff_60%_78%,_transparent_78%)]" />
                    </span>
                    <span className="font-semibold text-black">Hackathons</span>
                  </div>
                  <div className="space-y-3 px-5 py-5">
                    {["Inbox", "My events", "Reviews", "Pulse"].map((item) => (
                      <div key={item} className="flex items-center gap-2">
                        <span className="size-3 rounded-sm border border-black/20" />
                        <span>{item}</span>
                      </div>
                    ))}
                    <div className="pt-4 text-[#706F6B]/70">Workspace</div>
                    {["Applications", "Projects", "More"].map((item) => (
                      <div key={item} className="flex items-center gap-2">
                        <span className="size-3 rounded-full border border-black/20" />
                        <span>{item}</span>
                      </div>
                    ))}
                    <div className="pt-4 text-[#706F6B]/70">Favorites</div>
                    <div className="rounded-md bg-[#660000]/8 px-3 py-2 text-[#660000]">
                      Global hackathon map
                    </div>
                  </div>
                </aside>

                <div className="grid grid-rows-[3rem_1fr] border-r border-black/10">
                  <div className="flex items-center justify-between border-b border-black/10 bg-white px-7">
                    <span className="font-semibold text-black">
                      Upcoming deadlines
                    </span>
                    <span className="text-[#706F6B]">02 / 145</span>
                  </div>
                  <div className="bg-white px-16 py-12">
                    <h2 className="text-2xl font-semibold text-black">
                      ETHGlobal New York
                    </h2>
                    <p className="mt-5 max-w-[560px] text-sm leading-6 text-[#706F6B]">
                      Track registration, team status, travel notes, and
                      submission milestones from one calm dashboard.
                    </p>
                    <div className="mt-8 space-y-4">
                      <div className="h-12 rounded-lg border border-black/10 bg-[#F8F8F4]" />
                      <div className="h-12 rounded-lg border border-black/10 bg-[#F8F8F4]" />
                      <div className="h-12 rounded-lg border border-black/10 bg-[#F8F8F4]" />
                    </div>
                  </div>
                </div>

                <div className="bg-white px-8 py-12">
                  <div className="text-[#706F6B]">NA-2703</div>
                  <div className="mt-10 space-y-5">
                    <div>
                      <div className="text-[#706F6B]">Status</div>
                      <div className="mt-2 font-medium text-black">
                        In Progress
                      </div>
                    </div>
                    <div>
                      <div className="text-[#706F6B]">Priority</div>
                      <div className="mt-2 font-medium text-black">High</div>
                    </div>
                    <div>
                      <div className="text-[#706F6B]">Owner</div>
                      <div className="mt-2 font-medium text-black">jori</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section
        aria-labelledby="platform-audience-heading"
        className="bg-white px-8 pb-16 pt-20 text-left sm:px-14 sm:pb-20 sm:pt-24 lg:px-20"
      >
        <div className="mx-auto max-w-[1120px]">
          <div>
            <h2 className="text-sm font-medium tracking-normal text-[#706F6B]">
              Hackathons we track
            </h2>
            <div className="company-marquee mt-7 overflow-hidden py-1">
              <div className="company-marquee-track flex w-max items-center">
                <HackathonNameStrip />
                <HackathonNameStrip hidden />
              </div>
            </div>
          </div>

          <div className="mt-24 text-left">
            <h2
              id="platform-audience-heading"
              className="max-w-[760px] text-[0.9375rem] font-semibold leading-[1.25] tracking-normal text-black sm:text-lg lg:text-[1.325rem]"
            >
              Built for hackers, organizers, and sponsors alike. Discover
              hackathons, grow your hacker profile, organize better events with
              proven resources, and connect companies with the next generation
              of builders—all from a single platform.
            </h2>

            <div className="mt-10 grid gap-4 md:grid-cols-[1.95fr_1fr]">
              <article className="relative min-h-[460px] overflow-hidden rounded border border-black/10 bg-white p-5 text-left shadow-[0_18px_54px_rgba(0,0,0,0.06)] sm:p-7">
                <div className="relative z-10 flex items-start justify-between gap-4">
                  <h3 className="max-w-[420px] text-2xl font-semibold leading-tight text-black sm:text-[1.7rem]">
                    {audienceCards[0].title}
                  </h3>
                  <div className="flex size-9 shrink-0 items-center justify-center rounded bg-[#660000] text-white">
                    <Maximize2
                      aria-hidden="true"
                      className="size-4"
                      strokeWidth={1.75}
                    />
                  </div>
                </div>
                <div className="absolute inset-x-0 bottom-0 h-[64%] bg-[linear-gradient(135deg,_rgba(102,0,0,0.08),_rgba(248,248,244,0.95)_34%,_rgba(102,0,0,0.28)_70%,_rgba(112,111,107,0.2))]" />
                <div className="absolute bottom-8 left-8 z-10 hidden w-[27%] rounded-[1.45rem] border-[10px] border-black bg-white p-4 shadow-[0_24px_50px_rgba(0,0,0,0.2)] sm:block">
                  <div className="mx-auto mb-8 size-3 rounded-full bg-black/80" />
                  <div className="space-y-2 text-center">
                    <div className="mx-auto size-8 rounded-full border border-black/15" />
                    <div className="text-xs text-[#706F6B]">Profile</div>
                    <div className="text-2xl font-semibold text-black">87%</div>
                  </div>
                  <div className="mt-9 space-y-2">
                    <div className="h-2 rounded bg-black/10" />
                    <div className="h-2 w-3/4 rounded bg-black/10" />
                    <div className="h-9 rounded bg-[#660000]" />
                  </div>
                </div>
                <div className="absolute bottom-0 right-0 z-10 w-[76%] rounded-tl-xl border border-black/10 bg-white shadow-[0_22px_64px_rgba(0,0,0,0.12)]">
                  <div className="flex h-10 items-center gap-2 border-b border-black/10 px-5">
                    <span className="size-2 rounded-full bg-black/15" />
                    <span className="size-2 rounded-full bg-black/15" />
                    <span className="size-2 rounded-full bg-black/15" />
                    <span className="ml-auto h-5 w-40 rounded-full bg-[#F8F8F4]" />
                  </div>
                  <div className="grid min-h-[250px] grid-cols-[1.08fr_0.92fr] text-xs text-[#706F6B]">
                    <div className="space-y-4 border-r border-black/10 p-7">
                      <div className="h-8 rounded bg-[#F8F8F4]" />
                      <div className="h-8 rounded bg-[#F8F8F4]" />
                      <div className="h-8 rounded bg-[#660000]" />
                      <div className="h-8 rounded bg-[#F8F8F4]" />
                      <div className="h-8 rounded bg-[#F8F8F4]" />
                    </div>
                    <div className="p-7">
                      <div className="h-20 rounded border border-black/10 bg-[#F8F8F4]" />
                      <div className="mt-6 space-y-3">
                        <div className="h-2 rounded bg-black/10" />
                        <div className="h-2 w-5/6 rounded bg-black/10" />
                        <div className="h-2 w-2/3 rounded bg-black/10" />
                      </div>
                    </div>
                  </div>
                </div>
              </article>

              <article className="relative min-h-[460px] overflow-hidden rounded border border-black/10 bg-white p-5 text-left shadow-[0_18px_54px_rgba(0,0,0,0.06)] sm:p-7">
                <div className="relative z-10 flex items-start justify-between gap-4">
                  <h3 className="text-2xl font-semibold leading-tight text-black sm:text-[1.7rem]">
                    {audienceCards[1].title}
                  </h3>
                  <div className="flex size-9 shrink-0 items-center justify-center rounded bg-[#660000]/8 text-[#660000]">
                    <Maximize2
                      aria-hidden="true"
                      className="size-4"
                      strokeWidth={1.75}
                    />
                  </div>
                </div>
                <div className="absolute inset-x-0 bottom-0 h-[58%] bg-[linear-gradient(145deg,_rgba(248,248,244,0.9),_rgba(102,0,0,0.2)_58%,_rgba(112,111,107,0.14))]" />
                <div className="relative z-10 mt-20 space-y-4">
                  <div className="rounded border border-black/10 bg-white p-4 shadow-[0_20px_44px_rgba(0,0,0,0.08)]">
                    <div className="flex items-center gap-3">
                      <div className="flex size-9 items-center justify-center rounded bg-[#660000]/8 text-[#660000]">
                        <ClipboardList
                          aria-hidden="true"
                          className="size-4"
                          strokeWidth={1.75}
                        />
                      </div>
                      <div className="space-y-2">
                        <div className="h-2 w-24 rounded bg-black/20" />
                        <div className="h-2 w-16 rounded bg-black/10" />
                      </div>
                    </div>
                    <div className="mt-5 h-2 rounded-full bg-[#F8F8F4]">
                      <div className="h-full w-2/3 rounded-full bg-[#660000]" />
                    </div>
                  </div>
                  <div className="rounded border border-black/10 bg-white p-4 shadow-[0_20px_44px_rgba(0,0,0,0.08)]">
                    <div className="text-xs font-medium text-[#706F6B]">
                      Upcoming tasks
                    </div>
                    <div className="mt-5 flex h-28 items-end gap-2">
                      {[32, 48, 64, 42, 78, 56, 92, 68, 52, 74].map(
                        (height) => (
                          <span
                            key={height}
                            className="flex-1 rounded-t bg-[#660000]/55"
                            style={{ height: `${height}%` }}
                          />
                        )
                      )}
                    </div>
                  </div>
                </div>
              </article>

              <article className="relative min-h-[178px] overflow-hidden rounded border border-black/10 bg-white p-5 text-left shadow-[0_18px_54px_rgba(0,0,0,0.06)] sm:p-7 md:col-span-2">
                <div className="relative z-10 flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-2xl font-semibold leading-tight text-black sm:text-[1.7rem]">
                      {audienceCards[2].title}
                    </h3>
                    <div className="mt-8 grid max-w-[560px] grid-cols-3 gap-3">
                      <div className="h-16 rounded border border-black/10 bg-white/80" />
                      <div className="h-16 rounded border border-black/10 bg-white/80" />
                      <div className="h-16 rounded border border-black/10 bg-white/80" />
                    </div>
                  </div>
                  <div className="flex size-9 shrink-0 items-center justify-center rounded bg-[#660000]/8 text-[#660000]">
                    <Maximize2
                      aria-hidden="true"
                      className="size-4"
                      strokeWidth={1.75}
                    />
                  </div>
                </div>
                <div className="absolute inset-y-0 right-0 w-[55%] bg-[linear-gradient(110deg,_rgba(255,255,255,0),_rgba(102,0,0,0.14)_46%,_rgba(248,248,244,0.95))]" />
                <div className="absolute bottom-0 right-12 hidden h-[78%] w-[34%] items-end gap-2 md:flex">
                  {[58, 38, 74, 46, 88, 64, 52, 80, 44, 68, 92, 60].map(
                    (height) => (
                      <span
                        key={height}
                        className="flex-1 rounded-t bg-[#660000]/45"
                        style={{ height: `${height}%` }}
                      />
                    )
                  )}
                </div>
              </article>
            </div>
          </div>
        </div>
      </section>

      <section
        aria-labelledby="company-network-heading"
        className="bg-white px-8 pb-16 pt-4 text-left sm:px-14 sm:pb-20 lg:px-20"
      >
        <div className="mx-auto max-w-[1120px]">
          <h2
            id="company-network-heading"
            className="text-sm font-medium tracking-normal text-[#706F6B]"
          >
            Companies we&apos;ve worked with
          </h2>

          <div className="company-marquee mt-7 overflow-hidden py-1">
            <div className="company-marquee-track flex w-max items-center">
              <CompanyLogoStrip />
              <CompanyLogoStrip hidden />
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
