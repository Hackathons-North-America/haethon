import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { LoginRequiredDialog, LoginRequiredLink } from "@/components/login-required-dialog";

describe("LoginRequiredLink", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root.render(
        React.createElement(
          React.Fragment,
          null,
          React.createElement(LoginRequiredLink, { href: "/my" }, "My Hackathons"),
          React.createElement(LoginRequiredDialog)
        )
      );
    });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("keeps a signed-out visitor in place and opens the login prompt", async () => {
    const link = container.querySelector("a");

    await act(async () => {
      link?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });

    const dialog = document.querySelector<HTMLElement>("[role='dialog']");
    const loginLink = dialog?.querySelector<HTMLAnchorElement>("a");

    expect(dialog).toHaveTextContent("You need to log in first");
    expect(loginLink?.getAttribute("href")).toBe("/sign-in?redirect_url=%2Fmy");
    expect(window.location.pathname).not.toBe("/my");
  });
});
