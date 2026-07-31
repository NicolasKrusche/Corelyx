import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SYSTEM_FLAGS, type SystemFlags } from "@/lib/system-flags";

const readSystemFlags = vi.fn<() => Promise<SystemFlags>>();
const isMaintenanceBypassAdmin = vi.fn<() => Promise<boolean>>();

vi.mock("@/lib/system-flags", async () => {
  const actual = await vi.importActual<typeof import("@/lib/system-flags")>(
    "@/lib/system-flags"
  );
  return {
    ...actual,
    readSystemFlags: () => readSystemFlags(),
    isMaintenanceBypassAdmin: () => isMaintenanceBypassAdmin(),
  };
});

const { maintenanceGate } = await import("@/lib/maintenance-middleware");

function get(pathname: string): NextRequest {
  return new NextRequest(`https://www.corelyx.app${pathname}`);
}

beforeEach(() => {
  readSystemFlags.mockResolvedValue({ ...DEFAULT_SYSTEM_FLAGS, maintenanceMode: true });
  isMaintenanceBypassAdmin.mockResolvedValue(false);
});

describe("maintenanceGate during full maintenance", () => {
  it("keeps the landing page and marketing site online", async () => {
    for (const publicPath of ["/", "/pricing", "/docs", "/blog", "/privacy", "/security"]) {
      expect(await maintenanceGate(get(publicPath))).toBeNull();
    }
  });

  it("blocks the signed-in app with a 503 page", async () => {
    const response = await maintenanceGate(get("/dashboard"));
    expect(response?.status).toBe(503);
    expect(response?.headers.get("content-type")).toContain("text/html");
    expect(response?.headers.get("Retry-After")).toBe("3600");
  });

  it("blocks nested app routes", async () => {
    expect((await maintenanceGate(get("/programs/abc/editor")))?.status).toBe(503);
    expect((await maintenanceGate(get("/settings/billing")))?.status).toBe(503);
  });

  it("blocks the app API with a 503 JSON body", async () => {
    const response = await maintenanceGate(get("/api/programs"));
    expect(response?.status).toBe(503);
    expect(await response?.json()).toMatchObject({ error: "SERVICE_UNAVAILABLE" });
  });

  it("still lets admins through to the app", async () => {
    isMaintenanceBypassAdmin.mockResolvedValue(true);
    expect(await maintenanceGate(get("/dashboard"))).toBeNull();
  });

  it("keeps the exempt infrastructure routes reachable", async () => {
    for (const exempt of ["/login", "/api/health", "/api/internal/cron/tick", "/maintenance"]) {
      expect(await maintenanceGate(get(exempt))).toBeNull();
    }
  });
});

describe("maintenanceGate when maintenance is off", () => {
  it("lets the app through", async () => {
    readSystemFlags.mockResolvedValue({ ...DEFAULT_SYSTEM_FLAGS });
    expect(await maintenanceGate(get("/dashboard"))).toBeNull();
  });

  it("still enforces scoped area blocks", async () => {
    readSystemFlags.mockResolvedValue({ ...DEFAULT_SYSTEM_FLAGS, disabledAreas: ["editor"] });
    const response = await maintenanceGate(get("/programs/abc/editor"));
    expect(response?.status).toBe(503);
  });
});
