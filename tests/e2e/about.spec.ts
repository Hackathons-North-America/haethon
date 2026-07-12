import { expect, test } from "@playwright/test";

test("pins the about showcase and swaps sections on scroll", async ({ page }) => {
  await page.goto("/about");

  await expect(
    page.getByRole("heading", {
      name: "We build the hackathon ecosystem we wanted as students.",
    })
  ).toBeVisible();

  const stage = page.locator("[data-about-stage]");
  const sectionNav = page.getByRole("navigation", { name: "About sections" });

  await stage.scrollIntoViewIfNeeded();

  // Side images are already visible once the section is in view.
  await expect(stage.getByText("During YC")).toBeVisible();
  await expect(stage.getByText("Now")).toBeVisible();

  // Hack Canada is the first (active) section by default.
  await expect(
    sectionNav.getByRole("button", { name: "Hack Canada" })
  ).toHaveAttribute("aria-current", "true");

  await sectionNav
    .getByRole("button", { name: "Hackathons North America" })
    .click();
  await expect(
    sectionNav.getByRole("button", { name: "Hackathons North America" })
  ).toHaveAttribute("aria-current", "true");

  await sectionNav.getByRole("button", { name: "Corporate" }).click();
  await expect(
    sectionNav.getByRole("button", { name: "Corporate" })
  ).toHaveAttribute("aria-current", "true");
});
