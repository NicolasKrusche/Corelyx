import { createServiceClient } from "@/lib/api";

const store = new Map<string, number[]>();

function isProductionRuntime() {
  return [process.env.NODE_ENV, process.env.VERCEL_ENV, process.env.APP_ENV].some(
    (value) => value === "production"
  );
}

function localRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const timestamps = (store.get(key) ?? []).filter((t) => now - t < windowMs);
  if (timestamps.length >= limit) return false;
  timestamps.push(now);
  store.set(key, timestamps);
  return true;
}

export async function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<boolean> {
  try {
    const service = createServiceClient();
    const { data, error } = await (service as any).rpc("check_rate_limit", {
      p_key: key,
      p_limit: limit,
      p_window_seconds: Math.ceil(windowMs / 1000),
    });

    if (!error && typeof data === "boolean") {
      return data;
    }

    if (isProductionRuntime()) {
      console.error("[rate-limit] distributed limiter unavailable", error);
      return false;
    }
  } catch (error) {
    if (isProductionRuntime()) {
      console.error("[rate-limit] distributed limiter failed", error);
      return false;
    }
  }

  return localRateLimit(key, limit, windowMs);
}
