type ShopifyStorefrontConfig = {
  shopDomain: string;
  storefrontAccessToken: string;
};

const STOREFRONT_API_VERSION = "2026-04";
const CONFIG_CACHE_TTL_MS = 60_000;
const FETCH_TIMEOUT_MS = 10_000;

let cachedConfig:
  | { value: ShopifyStorefrontConfig; expiresAt: number }
  | undefined;

function getDirectShopifyConfig(): ShopifyStorefrontConfig {
  const shopDomain = process.env.SHOPIFY_STORE_DOMAIN?.trim().replace(
    /^https?:\/\//,
    "",
  ).replace(/\/+$/, "");
  const storefrontAccessToken =
    process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN?.trim();

  if (!shopDomain || !storefrontAccessToken) {
    throw new Error(
      "Shopify connection is not configured. Set SHOPIFY_STORE_DOMAIN and SHOPIFY_STOREFRONT_ACCESS_TOKEN.",
    );
  }

  if (!shopDomain.includes(".")) {
    throw new Error("SHOPIFY_STORE_DOMAIN must be a valid Shopify hostname.");
  }

  return { shopDomain, storefrontAccessToken };
}

export async function getShopifyStorefrontConfig(
  options: { forceRefresh?: boolean } = {},
): Promise<ShopifyStorefrontConfig> {
  if (
    cachedConfig &&
    !options.forceRefresh &&
    Date.now() < cachedConfig.expiresAt
  ) {
    return cachedConfig.value;
  }

  cachedConfig = {
    value: getDirectShopifyConfig(),
    expiresAt: Date.now() + CONFIG_CACHE_TTL_MS,
  };
  return cachedConfig.value;
}

export async function shopifyStorefrontRequest<T>(
  query: string,
  variables?: Record<string, unknown>,
  options: { retryOnUnauthorized?: boolean } = {},
): Promise<T> {
  const config = await getShopifyStorefrontConfig();
  const response = await fetch(
    `https://${config.shopDomain}/api/${STOREFRONT_API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Storefront-Private-Token": config.storefrontAccessToken,
      },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    },
  );

  if (
    options.retryOnUnauthorized !== false &&
    (response.status === 401 || response.status === 403)
  ) {
    cachedConfig = undefined;
    await getShopifyStorefrontConfig({ forceRefresh: true });
    return shopifyStorefrontRequest<T>(query, variables, {
      retryOnUnauthorized: false,
    });
  }

  const text = await response.text();
  const json = text ? parseJson(text) : {};
  if (!response.ok || json.errors?.length) {
    throw new Error(
      `Shopify Storefront API error (${response.status}): ${JSON.stringify(json.errors ?? json)}`,
    );
  }
  return json.data as T;
}

function parseJson(text: string): {
  data?: unknown;
  errors?: Array<{ message: string }>;
} {
  try {
    return JSON.parse(text) as {
      data?: unknown;
      errors?: Array<{ message: string }>;
    };
  } catch {
    return { errors: [{ message: text }] };
  }
}