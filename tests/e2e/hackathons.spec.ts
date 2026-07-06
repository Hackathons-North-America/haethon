import { expect, test } from "@playwright/test";

test("opens the hackathons browse page from the home nav", async ({ page }) => {
  await page.goto("/");

  await page
    .getByRole("navigation", { name: "Primary navigation" })
    .getByRole("link", { name: "Hackathons", exact: true })
    .click();

  await expect(page).toHaveURL(/\/hackathons$/);
  await expect(
    page.getByRole("navigation", { name: "Primary navigation" })
  ).toBeVisible();
  await expect(page.getByLabel("Name")).toBeVisible();
  await expect(page.getByLabel("Countries")).toBeVisible();
  await expect(page.getByLabel("Date")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Search hackathons" })
  ).toBeVisible();

  await expect(
    page.getByRole("heading", { name: "Upcoming hackathons" })
  ).toBeVisible();
  await expect(page.getByText("18 test events")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Hack the North" })
  ).toBeVisible();
  await expect(page.locator("article")).toHaveCount(18);

  const hackTheNorth = page.locator("article").filter({
    has: page.getByRole("heading", { name: "Hack the North" }),
  });

  await expect(hackTheNorth.getByText("MLH approved")).toHaveCount(0);
  await expect(hackTheNorth.getByText("Hackathon H&N approved")).toHaveCount(0);
  await expect(hackTheNorth.getByText("Sep 13-15, 2026")).toBeVisible();
  await expect(hackTheNorth.getByText("Waterloo, ON")).toBeVisible();
  await expect(
    hackTheNorth.getByText("Canada's flagship student hackathon")
  ).toBeVisible();

  await hackTheNorth
    .getByRole("button", { name: "Add Hack the North to library" })
    .click();
  await expect(
    hackTheNorth.getByRole("button", {
      name: "Remove Hack the North from library",
    })
  ).toHaveAttribute("aria-pressed", "true");

  await expect(hackTheNorth.getByText("142", { exact: true })).toBeVisible();
  await hackTheNorth.getByRole("button", { name: "Upvote Hack the North" }).click();
  await expect(hackTheNorth.getByText("143", { exact: true })).toBeVisible();
  await hackTheNorth.getByRole("button", { name: "Downvote Hack the North" }).click();
  await expect(hackTheNorth.getByText("141", { exact: true })).toBeVisible();

  await page.getByLabel("Countries").fill("can");
  await page.getByRole("option", { name: "Canada" }).click();
  await expect(page.getByRole("button", { name: "Remove Canada" })).toBeVisible();
  await page.getByRole("button", { name: "Search hackathons" }).click();
  await expect(page).toHaveURL(/countries=Canada/);
  await page.getByRole("button", { name: "Clear hackathon search" }).click();
  await expect(page).toHaveURL(/\/hackathons$/);

  await page.getByLabel("Name").fill("Hack the North");
  await page.getByRole("button", { name: "Search hackathons" }).click();
  await expect(page).toHaveURL(/\/hackathons\?q=Hack\+the\+North/);

  await expect(page.getByRole("heading", { name: "Hack the North" })).toBeVisible();
  await expect(page.locator("article")).toHaveCount(1);
});
