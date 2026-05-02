import { NextResponse } from "next/server";
import { getHealthStatus } from "@/lib/health-check";

export const dynamic = "force-dynamic";

export async function GET() {
  const health = await getHealthStatus();
  
  // Return appropriate HTTP status code
  const statusCode = 
    health.status === "healthy" ? 200 :
    health.status === "degraded" ? 200 :  // Still return 200 for degraded
    503;  // Service unavailable for unhealthy
  
  return NextResponse.json(health, { status: statusCode });
}
