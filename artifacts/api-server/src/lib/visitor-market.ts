import { createHash } from "node:crypto";
import { isIP } from "node:net";
import type { Request } from "express";
import { countries } from "countries-list";

export type VisitorMarket = {
  countryCode: string;
  currencyCode: string;
};

type CachedMarket = {
  market: VisitorMarket;
  expiresAt: number;
};

type IpWhoResponse = {
  success?: boolean;
  country_code?: string;
};

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_CACHED_IPS = 2_000;
const FALLBACK_MARKET: VisitorMarket = { countryCode: "NG", currencyCode: "NGN" };
const marketByIp = new Map<string, CachedMarket>();

function marketForCountry(rawCountryCode: string | undefined): VisitorMarket | null {
  const countryCode = rawCountryCode?.trim().toUpperCase();
  if (!countryCode || !/^[A-Z]{2}$/.test(countryCode)) return null;

  const country = countries[countryCode as keyof typeof countries];
  const currencyCode = country?.currency?.[0];
  if (!currencyCode || !/^[A-Z]{3}$/.test(currencyCode)) return null;

  return { countryCode, currencyCode };
}

function getClientIp(request: Request): string | null {
  const forwardedFor = request.get("x-forwarded-for")?.split(",")[0];
  const candidates = [
    request.get("cf-connecting-ip"),
    request.get("x-real-ip"),
    forwardedFor,
    request.socket.remoteAddress,
  ];

  for (const rawCandidate of candidates) {
    const candidate = rawCandidate?.trim().replace(/^::ffff:/i, "");
    if (candidate && isPublicIp(candidate)) return candidate;
  }
  return null;
}

function isPublicIp(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) {
    const [first, second] = ip.split(".").map(Number);
    return !(
      first === 0 ||
      first === 10 ||
      first === 127 ||
      first >= 224 ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168) ||
      (first === 100 && second >= 64 && second <= 127)
    );
  }
  if (version === 6) {
    const normalized = ip.toLowerCase();
    return !(
      normalized === "::" ||
      normalized === "::1" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe8") ||
      normalized.startsWith("fe9") ||
      normalized.startsWith("fea") ||
      normalized.startsWith("feb")
    );
  }
  return false;
}

export async function getVisitorMarket(request: Request): Promise<VisitorMarket> {
  const edgeCountry =
    request.get("cf-ipcountry") ??
    request.get("x-vercel-ip-country") ??
    request.get("cloudfront-viewer-country");
  const edgeMarket = marketForCountry(edgeCountry);
  if (edgeMarket) return edgeMarket;

  const ip = getClientIp(request);
  if (!ip) return FALLBACK_MARKET;

  const now = Date.now();
  const cacheKey = createHash("sha256").update(ip).digest("hex");
  const cached = marketByIp.get(cacheKey);
  if (cached && now < cached.expiresAt) return cached.market;

  try {
    const response = await fetch(
      `https://ipwho.is/${encodeURIComponent(ip)}?fields=success,country_code`,
      { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(3_000) },
    );
    if (!response.ok) return FALLBACK_MARKET;

    const result = (await response.json()) as IpWhoResponse;
    const market = result.success ? marketForCountry(result.country_code) : null;
    if (!market) return FALLBACK_MARKET;

    marketByIp.set(cacheKey, { market, expiresAt: now + CACHE_TTL_MS });
    if (marketByIp.size > MAX_CACHED_IPS) {
      const oldestIp = marketByIp.keys().next().value;
      if (oldestIp) marketByIp.delete(oldestIp);
    }
    return market;
  } catch {
    return FALLBACK_MARKET;
  }
}
