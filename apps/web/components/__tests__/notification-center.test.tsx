// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/announcements", () => ({ ANNOUNCEMENTS: [] }));

import { NotificationCenter } from "../notification-center";

describe("NotificationCenter", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    localStorage.clear();

    vi.stubGlobal("React", React);
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const payload = url.startsWith("/api/sidebar-data")
        ? {
            pendingApprovalsCount: 0,
            failedRunsCount: 0,
            usage: {
              runs: { current: 0, total: null },
              genesis: { usesThisMonth: 0, maxUses: null },
              aiCredits: null,
            },
          }
        : { notifications: [] };

      return { ok: true, json: async () => payload } as Response;
    }));
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it("closes an open panel when the sidebar collapses", async () => {
    await act(async () => {
      root.render(<NotificationCenter sidebarCollapseSignal={0} />);
    });

    const button = container.querySelector<HTMLButtonElement>('button[title="Notifications"]');
    expect(button).not.toBeNull();

    await act(async () => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });
    expect(container.querySelector('[role="dialog"][aria-label="Notifications"]')).not.toBeNull();

    await act(async () => {
      root.render(<NotificationCenter sidebarCollapseSignal={1} />);
    });
    expect(container.querySelector('[role="dialog"][aria-label="Notifications"]')).toBeNull();
  });
});
