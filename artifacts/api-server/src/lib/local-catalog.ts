import { randomUUID } from "node:crypto";
import type { MilmartsProduct, MilmartsProductVariant } from "@workspace/db";
import {
  convertToNaira,
  type NairaExchangeRateSnapshot,
} from "./naira-conversion";

export function newLocalVariantId(productId: number): string {
  return `milmarts:${productId}:${randomUUID()}`;
}

export function productIdFromVariantId(variantId: string): number | null {
  const match = /^milmarts:(\d+):[0-9a-f-]{36}$/i.exec(variantId);
  if (!match) return null;
  const productId = Number(match[1]);
  return Number.isSafeInteger(productId) && productId > 0 ? productId : null;
}

export function localProductToResponse(
  product: MilmartsProduct,
  rateSnapshot: NairaExchangeRateSnapshot | null,
) {
  const variants: MilmartsProductVariant[] = product.variants;
  const variantPrices = variants.map((variant) => variant.price);
  const priceCurrency = variantPrices[0]?.currencyCode ?? "NGN";
  const comparablePrices = variantPrices.filter(
    (price) => price.currencyCode.toUpperCase() === priceCurrency.toUpperCase(),
  );
  const sortedPrices = [...comparablePrices].sort(
    (left, right) => Number(left.amount) - Number(right.amount),
  );
  const minVariantPrice = sortedPrices[0] ?? { amount: "0", currencyCode: priceCurrency };
  const maxVariantPrice = sortedPrices.at(-1) ?? minVariantPrice;
  const images = product.images ?? [];

  return {
    id: String(product.id),
    title: product.title,
    handle: product.handle,
    description: product.description,
    category: product.category,
    vendor: product.vendor,
    tags: product.tags ?? [],
    isPublished: product.isPublished,
    source: product.sourceShopifyId ? "shopify" as const : "manual" as const,
    featuredImage: images[0] ?? null,
    images,
    priceRange: { minVariantPrice, maxVariantPrice },
    nairaPriceRange: {
      minVariantPrice: convertToNaira(minVariantPrice, rateSnapshot),
      maxVariantPrice: convertToNaira(maxVariantPrice, rateSnapshot),
    },
    variants: variants.map((variant) => ({
      ...variant,
      priceInNaira: convertToNaira(variant.price, rateSnapshot),
    })),
  };
}

export function slugifyProductHandle(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 255)
    .replace(/-+$/g, "");
}
