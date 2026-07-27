import { describe, expect, it } from "vitest";

import {
  devpostProfileUrl,
  devpostProjectUrl,
  parseDevpostProfile,
  parseDevpostProject,
} from "@/lib/devpost/scrape";

// Fixtures mirror the real markup served by devpost.com (captured July 2026):
// profile pages render each project as a `link-to-software` anchor around a
// gallery card, and project pages carry a `#submissions` aside listing the
// hackathons the project was entered into, with `span.winner` prize labels.

const profileHtml = `
<h1 id="portfolio-user-name">
  Matthew Gerrior
    <small>(MGerrior)</small>
</h1>
<p class="large" id="portfolio-user-bio">
  <i>Senior Software Engineer @ Devpost — haethon-abc123xy</i>
</p>
<div id="software-entries">
  <a class="block-wrapper-link fade link-to-software" href="https://devpost.com/software/hackercard">
    <div class="software-entry gallery-entry fade visible">
      <figcaption>
        <div class="software-entry-name entry-body">
          <h5>
            HackerCard
          </h5>
          <p class="small tagline">Embeddable hacker cards</p>
        </div>
      </figcaption>
    </div>
  </a>
  <a class="block-wrapper-link fade link-to-software" href="https://devpost.com/software/editpost">
    <div class="software-entry gallery-entry fade visible">
      <h5>EditPost</h5>
    </div>
  </a>
  <a class="block-wrapper-link fade link-to-software" href="https://devpost.com/software/hackercard">
    <h5>HackerCard duplicate card</h5>
  </a>
</div>
`;

const projectHtml = `
<h1 id="app-title">HackerCard</h1>
<p class="large">
  Embeddable hacker cards using the Unofficial Devpost API
</p>
<nav class="app-links section">
  <ul data-role="software-urls" class="no-bullet">
    <li><a href="https://github.com/challengepost/hacker_card"><span>github.com</span></a></li>
    <li><a href="https://hackercard.example.com"><span>hackercard.example.com</span></a></li>
  </ul>
</nav>
<aside id="app-details-right">
  <div id="submissions" class="section">
    <h4 class="clearfix">Submitted to</h4>
    <ul class="software-list-with-thumbnail">
      <li>
        <div class="software-list-content">
          <p>
            <a href="https://devpost-hackathon-2015.devpost.com/">Devpost Hackathon 2015</a>
          </p>
          <ul class="no-bullet">
            <li>
              <span class="winner label radius small all-caps">Winner</span>
              Dinner In on Devpost
            </li>
          </ul>
        </div>
      </li>
      <li>
        <div class="software-list-content">
          <p>
            <a href="https://global-hack.devpost.com/">Global Hack Week</a>
          </p>
        </div>
      </li>
    </ul>
  </div>
  <section id="app-team">
    <time class="timeago" datetime="2016-01-05T10:00:00-05:00">later comment</time>
  </section>
</aside>
<time class="timeago" datetime="2015-11-12T18:47:51-05:00">Nov 12, 2015</time>
`;

describe("parseDevpostProfile", () => {
  it("extracts the display name, bio text, and deduplicated project slugs", () => {
    const profile = parseDevpostProfile(profileHtml);

    expect(profile.displayName).toBe("Matthew Gerrior");
    expect(profile.bio).toBe("Senior Software Engineer @ Devpost — haethon-abc123xy");
    expect(profile.projectRefs).toEqual([
      { slug: "hackercard", title: "HackerCard" },
      { slug: "editpost", title: "EditPost" },
    ]);
    expect(profile.hasNextPage).toBe(false);
  });

  it("reports pagination when a rel=next link is present", () => {
    expect(parseDevpostProfile(`${profileHtml}<a rel="next" href="/MGerrior?page=2">2</a>`).hasNextPage).toBe(true);
  });

  it("returns empty results for pages without portfolio markup", () => {
    const profile = parseDevpostProfile("<html><body>Not a profile</body></html>");

    expect(profile.displayName).toBeNull();
    expect(profile.bio).toBeNull();
    expect(profile.projectRefs).toEqual([]);
  });
});

describe("parseDevpostProject", () => {
  it("extracts title, tagline, links, and every hackathon submission", () => {
    const project = parseDevpostProject("hackercard", projectHtml);

    expect(project.title).toBe("HackerCard");
    expect(project.tagline).toBe("Embeddable hacker cards using the Unofficial Devpost API");
    expect(project.links).toEqual(["https://github.com/challengepost/hacker_card", "https://hackercard.example.com"]);
    expect(project.submissions).toEqual([
      {
        hackathonName: "Devpost Hackathon 2015",
        hackathonUrl: "https://devpost-hackathon-2015.devpost.com/",
        awards: ["Dinner In on Devpost"],
      },
      {
        hackathonName: "Global Hack Week",
        hackathonUrl: "https://global-hack.devpost.com/",
        awards: [],
      },
    ]);
  });

  it("uses the earliest timestamp on the page as the submission date", () => {
    expect(parseDevpostProject("hackercard", projectHtml).submittedAt?.toISOString()).toBe("2015-11-12T23:47:51.000Z");
  });

  it("falls back to the label when a winner entry has no prize text", () => {
    const html = projectHtml.replace("Dinner In on Devpost", "");
    expect(parseDevpostProject("hackercard", html).submissions[0].awards).toEqual(["Winner"]);
  });

  it("handles pages without a submissions section", () => {
    const project = parseDevpostProject("solo", '<h1 id="app-title">Solo</h1>');

    expect(project.submissions).toEqual([]);
    expect(project.submittedAt).toBeNull();
  });
});

describe("url builders", () => {
  it("builds profile and project urls from validated handles", () => {
    expect(devpostProfileUrl("MGerrior")).toBe("https://devpost.com/MGerrior");
    expect(devpostProfileUrl("MGerrior", 2)).toBe("https://devpost.com/MGerrior?page=2");
    expect(devpostProjectUrl("hackercard")).toBe("https://devpost.com/software/hackercard");
  });

  it("rejects handles and slugs that could change the request path", () => {
    expect(() => devpostProfileUrl("../admin")).toThrow();
    expect(() => devpostProjectUrl("x/y")).toThrow();
  });
});
