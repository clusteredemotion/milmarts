import type { NairaMoney } from "@workspace/api-zod";

const EXCHANGE_RATE_URL = "https://open.er-api.com/v6/latest/USD";
const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const MAX_STALE_MS = 3 * DAY_MS;

type ProviderRatesResponse = {
  result?: string;
  base_code?: string;
  rates?: Record<string, number>;
  time_last_update_unix?: number;
  time_next_update_unix?: number;
};

export type NairaExchangeRateSnapshot = {
  rates: Record<string, number>;
  updatedAt: string;
  isStale: boolean;
};

export type ConvertedCurrency = {
  amount: string;
  currencyCode: string;
  rateUpdatedAt: Date | null;
  rateIsStale: boolean;
};

type CachedRates = {
  rates: Record<string, number>;
  updatedAt: string;
  fetchedAt: number;
  refreshAt: number;
};

let cachedRates: CachedRates | null = null;
let inFlightRequest: Promise<CachedRates> | null = null;
let retryAfter = 0;

async function fetchAndCacheRates(): Promise<CachedRates> {
  const response = await fetch(EXCHANGE_RATE_URL, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`Exchange-rate provider returned ${response.status}`);

  const body = (await response.json()) as ProviderRatesResponse;
  const ngnRate = body.rates?.NGN;
  const lastUpdated = body.time_last_update_unix;
  const nextUpdate = body.time_next_update_unix;
  if (
    body.result !== "success" ||
    body.base_code !== "USD" ||
    !body.rates ||
    !Number.isFinite(ngnRate) ||
    !ngnRate ||
    !Number.isFinite(lastUpdated) ||
    !Number.isFinite(nextUpdate)
  ) {
    throw new Error("Exchange-rate provider returned invalid USD rates");
  }

  const rates = Object.fromEntries(
    Object.entries(body.rates).filter(([, rate]) => Number.isFinite(rate) && rate > 0),
  );
  const fetchedAt = Date.now();
  const nextRefreshAt = (nextUpdate as number) * 1000 + MINUTE_MS;
  cachedRates = {
    rates,
    updatedAt: new Date((lastUpdated as number) * 1000).toISOString(),
    fetchedAt,
    refreshAt: Math.max(nextRefreshAt, fetchedAt + MINUTE_MS),
  };
  retryAfter = 0;
  return cachedRates;
}

export async function getNairaExchangeRateSnapshot(): Promise<NairaExchangeRateSnapshot> {
  const now = Date.now();
  if (cachedRates && now < cachedRates.refreshAt) {
    return { rates: cachedRates.rates, updatedAt: cachedRates.updatedAt, isStale: false };
  }
  if (now < retryAfter) {
    if (cachedRates && now - cachedRates.fetchedAt <= MAX_STALE_MS) {
      return { rates: cachedRates.rates, updatedAt: cachedRates.updatedAt, isStale: true };
    }
    throw new Error("Exchange-rate refresh is temporarily unavailable");
  }

  try {
    inFlightRequest ??= fetchAndCacheRates();
    const freshRates = await inFlightRequest;
    return { rates: freshRates.rates, updatedAt: freshRates.updatedAt, isStale: false };
  } catch (error) {
    retryAfter = Date.now() + 5 * MINUTE_MS;
    if (cachedRates && Date.now() - cachedRates.fetchedAt <= MAX_STALE_MS) {
      return { rates: cachedRates.rates, updatedAt: cachedRates.updatedAt, isStale: true };
    }
    throw error;
  } finally {
    inFlightRequest = null;
  }
}

export function convertToNaira(
  money: { amount: string; currencyCode: string },
  snapshot: NairaExchangeRateSnapshot | null,
): NairaMoney | null {
  return convertToCurrency(money, "NGN", snapshot) as NairaMoney | null;
}

export function convertToCurrency(
  money: { amount: string; currencyCode: string },
  targetCurrencyCode: string,
  snapshot: NairaExchangeRateSnapshot | null,
): ConvertedCurrency | null {
  const amount = Number(money.amount);
  if (!Number.isFinite(amount)) return null;

  const sourceCurrencyCode = money.currencyCode.toUpperCase();
  const targetCurrency = targetCurrencyCode.toUpperCase();
  if (sourceCurrencyCode === targetCurrency) {
    return {
      amount: money.amount,
      currencyCode: targetCurrency,
      rateUpdatedAt: null,
      rateIsStale: false,
    };
  }
  if (!snapshot) return null;

  const sourceUnitsPerUsd = sourceCurrencyCode === "USD" ? 1 : snapshot.rates[sourceCurrencyCode];
  const targetUnitsPerUsd = targetCurrency === "USD" ? 1 : snapshot.rates[targetCurrency];
  if (
    !Number.isFinite(sourceUnitsPerUsd) ||
    !sourceUnitsPerUsd ||
    !Number.isFinite(targetUnitsPerUsd) ||
    !targetUnitsPerUsd
  ) {
    return null;
  }

  const convertedAmount = amount * (targetUnitsPerUsd / sourceUnitsPerUsd);
  if (!Number.isFinite(convertedAmount)) return null;

  return {
    amount: convertedAmount.toFixed(6),
    currencyCode: targetCurrency,
    rateUpdatedAt: new Date(snapshot.updatedAt),
    rateIsStale: snapshot.isStale,
  };
}
