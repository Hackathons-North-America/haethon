import React, { act } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";

import { AppShellContent, AppShellWipe } from "@/components/app-shell-transition";

function shell() {
  return React.createElement(
    React.Fragment,
    null,
    React.createElement(AppShellContent, null, "page"),
    React.createElement(AppShellWipe)
  );
}

describe("app shell intro", () => {
  let container: HTMLDivElement | undefined;

  afterEach(() => {
    container?.remove();
    container = undefined;
  });

  it("is part of the server-rendered document", () => {
    const html = renderToString(shell());

    expect(html).toContain("shell-intro-content");
    expect(html).toContain("data-shell-wipe");
  });

  it("keeps playing after the document hydrates", async () => {
    container = document.createElement("div");
    container.innerHTML = renderToString(shell());
    document.body.append(container);

    let root: ReturnType<typeof hydrateRoot> | undefined;

    await act(async () => {
      root = hydrateRoot(container!, shell());
    });

    // Hydration must not strip the classes mid-animation.
    expect(container.querySelector("[data-shell-wipe]")).not.toBeNull();
    expect(container.querySelector(".shell-intro-content")).not.toBeNull();

    await act(async () => root?.unmount());
  });

  it("is skipped when the shell mounts during a client-side navigation", async () => {
    container = document.createElement("div");
    document.body.append(container);

    const root = createRoot(container);

    await act(async () => {
      root.render(shell());
    });

    // Nothing may stand between a prefetched page and the click that opened it.
    expect(container.querySelector("[data-shell-wipe]")).toBeNull();
    expect(container.querySelector(".shell-intro-content")).toBeNull();
    expect(container).toHaveTextContent("page");

    await act(async () => root.unmount());
  });
});
