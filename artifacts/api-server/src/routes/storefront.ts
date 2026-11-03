import { randomUUID } from "node:crypto";
import { and, asc, count, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  db,
  milmartsProductsTable,
} from "@workspace/db";
import {
  CreateStorefrontCartBody,
  GetStorefrontProductParams,
  ListStorefrontProductsQueryParams,
  GetStorefrontProductResponse,
  ListStorefrontProductsResponse,
  UpdateStorefrontCartBody,
} from "@workspace/api-zod";
import {
  convertToNaira,
  getNairaExchangeRateSnapshot,
  type NairaExchangeRateSnapshot,
} from "../lib/naira-conversion";
import { getVisitorMarket } from "../lib/visitor-market";
import { localProductToResponse, productIdFromVariantId } from "../lib/local-catalog";

const router: IRouter = Router();

router.get("/storefront/visitor-market", async (req, res): Promise<void> => {
  try {
    const [visitorMarket, rateSnapshot] = await Promise.all([
      getVisitorMarket(req),
      getNairaExchangeRateSnapshot(),
    ]);
    res.json({
      ...visitorMarket,
      rates: rateSnapshot.rates,
      updatedAt: new Date(rateSnapshot.updatedAt),
      isStale: rateSnapshot.isStale,
    });
  } catch (error) {
    req.log.error({ err: error }, "Failed to load visitor currency rates");
    res.status(503).json({ error: "Local currency rates are temporarily unavailable." });
  }
});

router.get("/storefront/products", async (req, res): Promise<void> => {
  const parsed = ListStorefrontProductsQueryParams.safeParse({
    query: typeof req.query.query === "string" ? req.query.query : undefined,
    first: typeof req.query.first === "string" ? Number(req.query.first) : undefined,
    after: typeof req.query.after === "string" ? req.query.after : undefined,
    category: typeof req.query.category === "string" ? req.query.category : undefined,
  });
  if (!parsed.success || (parsed.data.first !== undefined && !Number.isInteger(parsed.data.first))) {
    req.log.warn({ errors: parsed.success ? "first must be an integer" : parsed.error.message }, "Invalid product query");
    res.status(400).json({ error: "Invalid product query" });
    return;
  }

  try {
    const offset = parsed.data.after ? Number(parsed.data.after) : 0;
    if (!Number.isSafeInteger(offset) || offset < 0) {
      res.status(400).json({ error: "Invalid product page cursor." });
      return;
    }
    const conditions = [eq(milmartsProductsTable.isPublished, true)];
    if (parsed.data.category?.trim()) {
      conditions.push(eq(milmartsProductsTable.category, parsed.data.category.trim()));
    }
    const search = parsed.data.query?.trim().replace(/[\\%_]/g, "\\$&");
    if (search) {
      const pattern = `%${search}%`;
      conditions.push(or(
        ilike(milmartsProductsTable.title, pattern),
        ilike(milmartsProductsTable.description, pattern),
        ilike(milmartsProductsTable.vendor, pattern),
        ilike(milmartsProductsTable.category, pattern),
        sql`array_to_string(${milmartsProductsTable.tags}, ' ') ILIKE ${pattern}`,
      )!);
    }
    const where = and(...conditions);
    const [products, countResult, rateSnapshot] = await Promise.all([
      db.select()
        .from(milmartsProductsTable)
        .where(where)
        .orderBy(asc(milmartsProductsTable.id))
        .limit(parsed.data.first ?? 12)
        .offset(offset),
      db.select({ value: count() }).from(milmartsProductsTable).where(where),
      getNairaRatesOrNull(req),
    ]);
    const total = Number(countResult[0]?.value ?? 0);
    const hasNextPage = offset + products.length < total;
    res.json(ListStorefrontProductsResponse.parse({
      products: products.map((product) => localProductToResponse(product, rateSnapshot)),
      total,
      hasNextPage,
      nextCursor: hasNextPage ? String(offset + products.length) : null,
    }));
  } catch (error) {
    req.log.error({ err: error }, "Failed to load local Milmarts catalog");
    res.status(500).json({ error: "We could not load the catalog right now." });
  }
});

router.get("/storefront/products/:handle", async (req, res): Promise<void> => {
  const parsed = GetStorefrontProductParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid product handle" });
    return;
  }

  try {
    const [[product], rateSnapshot] = await Promise.all([
      db.select()
        .from(milmartsProductsTable)
        .where(and(
          eq(milmartsProductsTable.handle, parsed.data.handle),
          eq(milmartsProductsTable.isPublished, true),
        ))
        .limit(1),
      getNairaRatesOrNull(req),
    ]);
    if (!product) {
      res.status(404).json({ error: "Product not found" });
      return;
    }
    res.json(GetStorefrontProductResponse.parse(localProductToResponse(product, rateSnapshot)));
  } catch (error) {
    req.log.error({ err: error }, "Failed to load local Milmarts product");
    res.status(500).json({ error: "We could not load that product right now." });
  }
});

router.post("/storefront/cart", async (req, res): Promise<void> => {
  const parsed = CreateStorefrontCartBody.safeParse(req.body);
  if (!parsed.success || !validCartLines(parsed.success ? parsed.data.lines : [])) {
    res.status(400).json({ error: "Add at least one valid product to your cart." });
    return;
  }
  await buildLocalCart(req, res, parsed.data.lines, randomUUID(), 201);
});

router.patch("/storefront/cart", async (req, res): Promise<void> => {
  const parsed = UpdateStorefrontCartBody.safeParse(req.body);
  if (
    !parsed.success ||
    !parsed.data.cartId.trim() ||
    !validCartLines(parsed.success ? parsed.data.lines : [], true)
  ) {
    res.status(400).json({ error: "Your cart could not be updated." });
    return;
  }
  await buildLocalCart(req, res, parsed.data.lines, parsed.data.cartId, 200);
});

async function buildLocalCart(
  req: Parameters<Parameters<typeof router.post>[1]>[0],
  res: Parameters<Parameters<typeof router.post>[1]>[1],
  lines: Array<{ merchandiseId: string; quantity: number }>,
  cartId: string,
  responseStatus: number,
): Promise<void> {
  if (lines.length === 0) {
    const subtotal = { amount: "0.00", currencyCode: "NGN" };
    const rateSnapshot = await getNairaRatesOrNull(req);
    res.status(responseStatus).json({
      id: cartId,
      checkoutUrl: "/cart",
      totalQuantity: 0,
      subtotal,
      subtotalInNaira: convertToNaira(subtotal, rateSnapshot),
      lines: [],
    });
    return;
  }
  const productIds = lines.map((line) => productIdFromVariantId(line.merchandiseId));
  if (productIds.some((id) => id === null)) {
    res.status(400).json({ error: "A product in your bag is no longer valid. Refresh the catalog and try again." });
    return;
  }
  const uniqueProductIds = [...new Set(productIds as number[])];
  const totalQuantity = lines.reduce((total, line) => total + line.quantity, 0);
  if (totalQuantity > 250) {
    res.status(400).json({ error: "Your bag has too many items." });
    return;
  }

  try {
    const [products, rateSnapshot] = await Promise.all([
      db.select()
        .from(milmartsProductsTable)
        .where(and(
          inArray(milmartsProductsTable.id, uniqueProductIds),
          eq(milmartsProductsTable.isPublished, true),
        )),
      getNairaRatesOrNull(req),
    ]);
    const productsById = new Map(products.map((product) => [product.id, product]));
    const cartLines = [];
    let subtotalKobo = 0;

    for (const line of lines) {
      const productId = productIdFromVariantId(line.merchandiseId);
      const product = productId ? productsById.get(productId) : undefined;
      const variant = product?.variants.find((item) => item.id === line.merchandiseId);
      if (!product || !variant || !variant.availableForSale) {
        res.status(409).json({ error: "A product in your bag is no longer available. Refresh your bag and try again." });
        return;
      }
      const priceInNaira = convertToNaira(variant.price, rateSnapshot);
      if (!priceInNaira) {
        res.status(503).json({ error: "A product price could not be converted to Naira right now." });
        return;
      }
      const unitPriceKobo = Math.round(Number(priceInNaira.amount) * 100);
      if (!Number.isSafeInteger(unitPriceKobo) || unitPriceKobo < 0) {
        res.status(422).json({ error: "A product has an invalid price." });
        return;
      }
      subtotalKobo += unitPriceKobo * line.quantity;
      const variantLabel = variant.title && variant.title !== "Default Title" ? ` · ${variant.title}` : "";
      cartLines.push({
        id: `${cartId}:${variant.id}`,
        quantity: line.quantity,
        title: `${product.title}${variantLabel}`,
        merchandiseId: variant.id,
        price: variant.price,
        priceInNaira,
        image: product.images[0] ?? null,
      });
    }

    if (!Number.isSafeInteger(subtotalKobo)) {
      res.status(422).json({ error: "The cart total is too large to process." });
      return;
    }
    const subtotal = {
      amount: (subtotalKobo / 100).toFixed(2),
      currencyCode: "NGN",
    };
    res.status(responseStatus).json({
      id: cartId,
      checkoutUrl: "/cart",
      totalQuantity,
      subtotal,
      subtotalInNaira: convertToNaira(subtotal, rateSnapshot),
      lines: cartLines,
    });
  } catch (error) {
    req.log.error({ err: error }, "Failed to build local Milmarts cart");
    res.status(500).json({ error: "Your cart could not be updated right now." });
  }
}

function validCartLines(
  lines: Array<{ merchandiseId: string; quantity: number }>,
  allowEmpty = false,
): boolean {
  return (
    (allowEmpty || lines.length > 0) &&
    lines.every(
      (line) =>
        typeof line.merchandiseId === "string" &&
        line.merchandiseId.length > 0 &&
        Number.isInteger(line.quantity) &&
        line.quantity > 0 &&
        line.quantity <= 99,
    )
  );
}

async function getNairaRatesOrNull(
  req: Parameters<Parameters<typeof router.get>[1]>[0],
): Promise<NairaExchangeRateSnapshot | null> {
  try {
    return await getNairaExchangeRateSnapshot();
  } catch (error) {
    req.log.warn({ err: error }, "Naira price conversion unavailable");
    return null;
  }
}

export default router;