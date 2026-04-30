import { apiError } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";

export async function enforcePublicEndpointRateLimit(
  request: Request,
  scope: string,
  limit = 120,
  windowMs = 60_000
) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "unknown";
  const allowed = await rateLimit(`public:${scope}:ip:${ip}`, limit, windowMs);
  return allowed ? null : apiError("Too many requests. Try again later.", 429);
}
