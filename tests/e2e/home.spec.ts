import { expect, test } from "@playwright/test";

test("loads the home page shell", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("link", { name: "Hackathons North America", exact: true })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Primary navigation" })).toBeVisible();
  await expect(page.getByRole("link", { name: "About", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "FQA", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Submit", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Hackathons", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Open App", exact: true })).toHaveAttribute("href", "/hackathons");
  await expect(
    page.getByRole("heading", {
      name: "Search hundreds of upcoming hackathons, build your profile, and never miss another application deadline.",
    })
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Companies we've worked with" })).toBeVisible();
  await expect(page.getByRole("img", { name: /Placeholder company logo strip/ })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Build agents on infrastructure that thinks like them" })
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Ship apps that scale from zero to millions instantly" })
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Host platforms that serve every customer" })
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Built by you, or your agents" })
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Deploy", exact: true })).toHaveAttribute(
    "href",
    "/hackathons"
  );
});
