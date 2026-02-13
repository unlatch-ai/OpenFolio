import type { NextRequest } from "next/server";

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    return realIp;
  }

  return "unknown";
}

export function rateLimit(request: NextRequest, options: { key: string; limit: number; windowMs: number }) {
  const ip = getClientIp(request);
  const now = Date.now();
  const bucketKey = `${options.key}:${ip}`;
  const existing = buckets.get(bucketKey);

  if (!existing || now > existing.resetAt) {
    buckets.set(bucketKey, { count: 1, resetAt: now + options.windowMs });
    return {
      ok: true,
      remaining: options.limit - 1,
      resetAt: now + options.windowMs,
      limit: options.limit,
    };
  }

  if (existing.count >= options.limit) {
    return {
      ok: false,
      remaining: 0,
      resetAt: existing.resetAt,
      limit: options.limit,
    };
  }

  existing.count += 1;
  buckets.set(bucketKey, existing);

  return {
    ok: true,
    remaining: options.limit - existing.count,
    resetAt: existing.resetAt,
    limit: options.limit,
  };
}
