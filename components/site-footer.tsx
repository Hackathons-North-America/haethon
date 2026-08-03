import { FaLinkedinIn } from "react-icons/fa6";
import { SiGithub, SiInstagram } from "react-icons/si";

import { HoverUnderline } from "@/components/hover-underline";

const socialLinks = [
  {
    label: "GitHub",
    href: "https://github.com/Hackathons-North-America",
    Icon: SiGithub,
  },
  {
    label: "LinkedIn",
    href: "https://www.linkedin.com/company/hackathonscanada",
    Icon: FaLinkedinIn,
  },
  {
    label: "Instagram",
    href: "https://www.instagram.com/hackathoncanada",
    Icon: SiInstagram,
  },
] as const;

const footerLinkClassName =
  "group relative inline-flex min-h-11 items-center gap-2 py-2 text-sm font-medium text-paper focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-paper";

export function SiteFooter() {
  return (
    <footer className="bg-bark text-paper">
      <div className="grid lg:grid-cols-[1.35fr_1fr]">
        <div className="px-6 py-12 sm:px-10 sm:py-16 lg:px-12 lg:py-20">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-paper/65">
            Hackathons North America
          </p>
          <h2 className="mt-5 max-w-[42rem] text-4xl font-medium leading-[0.98] tracking-[-0.05em] sm:text-5xl lg:text-6xl">
            Find your people.
            <br />
            Build something great.
          </h2>
        </div>

        <div className="border-t border-paper/30 px-6 py-12 sm:px-10 sm:py-16 lg:border-l lg:border-t-0 lg:px-12 lg:py-20">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-paper/65">
            Get in touch
          </p>
          <p className="mt-5 max-w-[28rem] text-base leading-relaxed text-paper/75">
            Have an event to share, a partnership in mind, or a question for
            the team? Our inbox is always open.
          </p>
          <a
            className={`${footerLinkClassName} mt-5 text-base`}
            href="mailto:hi@hna.dev"
          >
            hi@hna.dev
            <span aria-hidden="true">↗</span>
            <HoverUnderline className="inset-x-0 bottom-1 bg-paper" />
          </a>
        </div>
      </div>

      <div className="flex flex-col gap-5 border-t border-paper/30 px-6 py-6 sm:px-10 lg:flex-row lg:items-center lg:justify-between lg:px-12">
        <nav aria-label="Social media">
          <ul className="flex flex-wrap gap-x-7 gap-y-1">
            {socialLinks.map(({ label, href, Icon }) => (
              <li key={label}>
                <a
                  className={footerLinkClassName}
                  href={href}
                  rel="noreferrer"
                  target="_blank"
                >
                  <Icon aria-hidden="true" className="size-4" />
                  {label}
                  <HoverUnderline className="inset-x-0 bottom-1 bg-paper" />
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <p className="text-xs leading-relaxed text-paper/60">
          © {new Date().getFullYear()} Hackathons North America. All rights
          reserved.
        </p>
      </div>
    </footer>
  );
}
