import { expect, test } from "@playwright/test";

test("opens the hackathons browse page from the home nav", async ({ page }) => {
  await page.goto("/");

  await page
    .getByRole("navigation", { name: "Primary navigation" })
    .getByRole("link", { name: "Open App", exact: true })
    .click();

  await expect(page).toHaveURL(/\/hackathons$/);
  await expect(
    page.getByRole("navigation", { name: "App navigation" })
  ).toBeVisible();
  await expect(page.getByLabel("Name")).toBeVisible();
  await expect(page.getByLabel("Countries")).toBeVisible();
  await expect(page.getByLabel("Date")).toBeVisible();
  await expect(page.getByRole("button", { name: "Search hackathons" })).toHaveCount(0);

  await expect(
    page.getByRole("heading", { name: "Upcoming hackathons" })
  ).toBeVisible();
  await expect(page.getByText("18 test events")).toHaveCount(0);
  await expect(page.locator("article").first()).toBeVisible();

  const catalogRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());

    if (request.method() === "GET" && url.pathname === "/api/hackathons") {
      catalogRequests.push(request.url());
    }
  });

  await page.getByRole("button", { name: "Countries" }).click();
  await page.getByLabel("Search countries").fill("can");
  await page.getByRole("option", { name: "Canada" }).click();
  await expect(page.getByRole("button", { name: "Remove Canada" })).toBeVisible();
  await expect(page).toHaveURL(/countries=Canada/);
  await expect(page.getByText(/Showing \d+ hackathons? matching your search\./)).toBeVisible();
  expect(catalogRequests).toEqual([]);
  await page.getByRole("button", { name: "Clear hackathon search" }).click();
  await expect(page).toHaveURL(/\/hackathons$/);

  const firstHackathonName = await page.locator("article h2").first().textContent();
  expect(firstHackathonName).toBeTruthy();
  await page.getByLabel("Name").fill(firstHackathonName!);
  await expect(page).toHaveURL(/\/hackathons\?q=/);

  await expect(page.locator("article h2").first()).toHaveText(firstHackathonName!);
  expect(catalogRequests).toEqual([]);
});

test("filters the loaded catalog automatically without search requests", async ({ page }) => {
  await page.goto("/hackathons");

  const catalogRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());

    if (request.method() === "GET" && url.pathname === "/api/hackathons") {
      catalogRequests.push(request.url());
    }
  });

  await page.getByRole("button", { name: "Countries" }).click();
  await page.getByLabel("Search countries").fill("can");
  await page.getByRole("option", { name: "Canada" }).click();

  await expect(page).toHaveURL(/countries=Canada/);
  const status = page.getByText(/Showing \d+ hackathons? matching your search\./);
  await expect(status).toBeVisible();
  const resultCount = Number((await status.textContent())?.match(/\d+/)?.[0]);
  await expect(page.locator("article")).toHaveCount(resultCount);
  expect(catalogRequests).toEqual([]);

  await page.getByRole("button", { name: "Clear hackathon search" }).click();
  const firstHackathonName = await page.locator("article h2").first().textContent();
  expect(firstHackathonName).toBeTruthy();

  await page.getByLabel("Name").fill(firstHackathonName!);
  await expect(page).toHaveURL(/\?q=/);
  await expect(page.locator("article h2").first()).toHaveText(firstHackathonName!);
  expect(catalogRequests).toEqual([]);
});
