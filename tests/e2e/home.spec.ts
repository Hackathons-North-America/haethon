import { expect, test } from "@playwright/test";

test("loads the home page shell", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("link", { name: "Hackathons North America", exact: true })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Primary navigation" })).toBeVisible();
  await expect(page.getByRole("link", { name: "About", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "FQA", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Submit", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Hackathons", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Login", exact: true })).toHaveAttribute("href", "/sign-in");
  await expect(
    page.getByRole("heading", {
      name: "Search hundreds of upcoming hackathons, build your profile, and never miss another application deadline.",
    })
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Companies we've worked with" })).toBeVisible();
  await expect(page.getByRole("img", { name: /Placeholder company logo strip/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Hackathons we track" })).toBeVisible();
  await expect(page.getByText("Hackathon 01").first()).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Built for hackers, organizers, and sponsors alike. Discover hackathons, grow your hacker profile, organize better events with proven resources, and connect companies with the next generation of builders—all from a single platform.",
    })
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Hacker", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Organizer", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Corporations/business", exact: true })).toBeVisible();
});
