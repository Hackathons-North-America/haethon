import { expect, test } from "@playwright/test";

test("loads the home page shell", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", {
      name: "Hackathons North America",
    })
  ).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Primary navigation" })).toBeVisible();
  await expect(page.getByRole("link", { name: "About", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "FAQ", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Switch to (light|dark) theme/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "Submit", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Open App", exact: true }).first()).toHaveAttribute(
    "href",
    "/hackathons"
  );
  await expect(
    page.getByRole("heading", {
      name: "Where hackers find their next weekend.",
    })
  ).toBeVisible();
  await expect(
    page.getByRole("img", {
      name: /Illustrated inuksuk on a maple-red island with boreal forest trees/,
    })
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "From coast to coast, every weekend that matters" })
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Built for the full hackathon cycle" })
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Ready to find your next hackathon?" })
  ).toBeVisible();
});
