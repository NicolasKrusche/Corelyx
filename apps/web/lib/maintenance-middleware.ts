import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isMaintenanceMode, getMaintenanceResponse } from "@/lib/feature-flags";

/**
 * Middleware to check for maintenance mode and emergency kill switch.
 * 
 * This runs after auth middleware and blocks API requests if:
 * - Emergency maintenance mode is enabled
 * - Kill switch has been triggered
 * - Specific features are disabled
 */

// Paths that should never be blocked (health checks, status pages)
const EXEMPT_PATHS = [
  "/api/health",
  "/api/status",
  "/status",
  "/_next",
  "/static",
];

// API routes that should be blocked during maintenance
const PROTECTED_API_PREFIXES = [
  "/api/genesis",
  "/api/programs",
  "/api/runs",
  "/api/connections",
];

export function maintenanceMiddleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // Check if path is exempt
  if (EXEMPT_PATHS.some((path) => pathname.startsWith(path))) {
    return null; // Continue to next middleware
  }
  
  // Check maintenance mode
  if (isMaintenanceMode()) {
    // Only block API routes during maintenance
    if (pathname.startsWith("/api/")) {
      const response = getMaintenanceResponse();
      return NextResponse.json(
        { error: response.error, message: response.message },
        { status: response.statusCode }
      );
    }
    
    // For non-API routes, let them through (they'll show a maintenance page)
    return null;
  }
  
  // Check feature-specific blocks
  if (pathname.startsWith("/api/genesis") || pathname.startsWith("/api/programs/generate")) {
    const { isGenesisEnabled } = require("@/lib/feature-flags");
    if (!isGenesisEnabled()) {
      return NextResponse.json(
        { 
          error: "FEATURE_DISABLED", 
          message: "Program generation is temporarily disabled." 
        },
        { status: 503 }
      );
    }
  }
  
  if (pathname.startsWith("/api/runs") && request.method !== "GET") {
    const { isWorkflowExecutionEnabled } = require("@/lib/feature-flags");
    if (!isWorkflowExecutionEnabled()) {
      return NextResponse.json(
        { 
          error: "FEATURE_DISABLED", 
          message: "Workflow execution is temporarily disabled." 
        },
        { status: 503 }
      );
    }
  }
  
  return null; // Continue to next middleware
}
