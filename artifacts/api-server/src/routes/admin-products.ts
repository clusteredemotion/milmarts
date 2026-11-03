import { and, asc, count, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { Router, type Request, type Response } from "express";
import {
  db,
  milmartsAdminAuditLogsTable,
  milmartsProductsTable,
  type MilmartsProductVariant,
} from "@workspace/db";
import {
  CreateAdminProductBody,
  CreateAdminProductResponse,
  DeleteAdminProductParams,
  DeleteAdminProductResponse,
  ImportAdminShopifyProductsResponse,
  ListAdminProductsQueryParams,
  ListAdminProductsResponse,
  UpdateAdminProductBody,
  UpdateAdminProductParams,
  UpdateAdminProductResponse,
} from "@workspace/api-zod";
import { isMilmartsAdmin } from "../lib/milmarts-admin";
import { localProductToResponse, newLocalVariantId, slugifyProductHandle } from "../lib/local-catalog";
import { getNairaExchangeRateSnapshot, type NairaExchangeRateSnapshot } from "../lib/naira-conversion";
import { shopifyStorefrontRequest } from "../lib/shopifyStorefrontClient";
import { getAuthenticatedUser } from "./auth";

const router = Router();
const SHOPIFY_IMPORT_PAGE_SIZE = 24;
const SHOPIFY_IMPORT_MAX_PRODUCTS = 5000;
const SHOPIFY_IMPORT_COMPLETED_ACTION = "shopify_catalog_import_completed";
const SHOPIFY_IMPORTED_PRODUCT_DELETED_ACTION = "delete_shopify_imported_product";

type CatalogVariant = {
  id: string;
  title: string;
  availableForSale: boolean;
  price: { amount: string; currencyCode: string };
};

type ShopifyCatalogProduct = {
  id: string;
  title: string;
  handle: string;
  description: string;
  productType: string;
  vendor: string;
  tags: string[];
  images: { nodes: Array<{ url: string; altText?: string | null }> };
  variants: {
    nodes: CatalogVariant[];
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  };
};

async function requireCatalogAdmin(req: Request, res: Response) {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    res.status(401).json({ error: "Log in to access product management." });
    return null;
  }
  if (!(await isMilmartsAdmin(user.id))) {
    res.status(403).json({ error: "Milmarts staff access is required." });
    return null;
  }
  return user;
}

async function getRateSnapshotOrNull(req: Request): Promise<NairaExchangeRateSnapshot | null> {
  try {
    return await getNairaExchangeRateSnapshot();
  } catch (error) {
    req.log.warn({ err: error }, "Naira product conversion unavailable");
    return null;
  }
}

function normalizeProductInput(input: {
  title: string;
  handle?: string;
  description?: string;
  category: string;
  vendor?: string;
  tags?: string[];
  images?: Array<{ url: string; altText?: string | null }>;
  variants: Array<{
    id?: string;
    title: string;
    availableForSale: boolean;
    quantityAvailable?: number | null;
    price: { amount: string; currencyCode: string };
  }>;
  isPublished: boolean;
}) {
  if (!input.title.trim()) throw new Error("Enter a product title.");
  if (!input.category.trim()) throw new Error("Choose a product category.");
  if (!input.variants.length) throw new Error("Add at least one product variant.");

  const variants = input.variants.map((variant) => {
    const amount = variant.price.amount.trim();
    const currencyCode = variant.price.currencyCode.trim().toUpperCase();
    if (!/^\d+(?:\.\d{1,6})?$/.test(amount) || Number(amount) <= 0) {
      throw new Error("Enter a valid positive price for every variant.");
    }
    if (!/^[A-Z]{3}$/.test(currencyCode)) {
      throw new Error("Use a three-letter currency code for every variant.");
    }
    return {
      id: variant.id,
      title: variant.title.trim() || "Default Title",
      availableForSale: variant.availableForSale,
      quantityAvailable: variant.quantityAvailable ?? null,
      price: { amount, currencyCode },
    };
  });

  const images = (input.images ?? []).map((image) => {
    let url: URL;
    try {
      url = new URL(image.url.trim());
    } catch {
      throw new Error("Enter a valid secure product image URL.");
    }
    if (url.protocol !== "https:") {
      throw new Error("Product image URLs must use HTTPS.");
    }
    return { url: url.toString(), altText: image.altText?.trim() || null };
  });

  return {
    title: input.title.trim(),
    handle: input.handle?.trim() ? slugifyProductHandle(input.handle) : undefined,
    description: input.description?.trim() ?? "",
    category: input.category.trim(),
    vendor: input.vendor?.trim() ?? "",
    tags: [...new Set((input.tags ?? []).map((tag) => tag.trim()).filter(Boolean))],
    images,
    variants,
    isPublished: input.isPublished,
  };
}

async function getUniqueHandle(baseValue: string, excludedProductId?: number): Promise<string> {
  const base = slugifyProductHandle(baseValue) || "milmarts-product";
  let candidate = base;
  let suffix = 2;
  while (true) {
    const [existing] = await db.select({ id: milmartsProductsTable.id })
      .from(milmartsProductsTable)
      .where(eq(milmartsProductsTable.handle, candidate))
      .limit(1);
    if (!existing || existing.id === excludedProductId) return candidate;
    const suffixText = `-${suffix++}`;
    candidate = `${base.slice(0, 255 - suffixText.length)}${suffixText}`;
  }
}

function inferCategory(product: Pick<ShopifyCatalogProduct, "title" | "productType" | "tags">): string {
  const text = `${product.productType} ${product.title} ${product.tags.join(" ")}`.toLowerCase();
  const rules: Array<{ category: string; terms: string[] }> = [
    { category: "Phones & tablets", terms: ["phone", "smartphone", "tablet", "ipad", "mobile"] },
    { category: "Computing", terms: ["laptop", "computer", "keyboard", "mouse", "monitor", "storage"] },
    { category: "Appliances", terms: ["appliance", "fan", "humidifier", "juicer", "cleaner", "blender", "mop"] },
    { category: "Electronics", terms: ["electronic", "charger", "usb", "speaker", "camera", "gimbal", "headphone"] },
    { category: "Health & beauty", terms: ["beauty", "skin", "hair", "nail", "makeup", "cosmetic", "health"] },
    { category: "Fashion", terms: ["fashion", "clothing", "shirt", "shoe", "sneaker", "bag", "backpack", "slipper"] },
    { category: "Supermarket", terms: ["food", "drink", "grocery", "water", "juice", "snack", "kitchen"] },
    { category: "Home & office", terms: ["home", "office", "furniture", "table", "chair", "bottle", "kitchenware"] },
  ];
  return rules.find((rule) => rule.terms.some((term) => text.includes(term)))?.category ?? "Official stores";
}

async function importShopifyPage(after?: string) {
  return shopifyStorefrontRequest<{
    products: {
      nodes: ShopifyCatalogProduct[];
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
    };
  }>(
    `#graphql
      query ImportMilmartsCatalog($first: Int!, $after: String, $country: CountryCode!) @inContext(country: $country) {
        products(first: $first, after: $after) {
          nodes {
            id
            title
            handle
            description
            productType
            vendor
            tags
            images(first: 8) { nodes { url altText } }
            variants(first: 20) {
              nodes { id title availableForSale price { amount currencyCode } }
              pageInfo { hasNextPage endCursor }
            }
          }
          pageInfo { hasNextPage endCursor }
        }
      }
    `,
    { first: SHOPIFY_IMPORT_PAGE_SIZE, after, country: "NG" },
  );
}

async function loadRemainingVariants(product: ShopifyCatalogProduct): Promise<CatalogVariant[]> {
  const variants = [...product.variants.nodes];
  let after = product.variants.pageInfo.endCursor;
  let hasNextPage = product.variants.pageInfo.hasNextPage;
  while (hasNextPage && after) {
    const page = await shopifyStorefrontRequest<{
      node: {
        variants: {
          nodes: CatalogVariant[];
          pageInfo: { hasNextPage: boolean; endCursor: string | null };
        };
      } | null;
    }>(
      `#graphql
        query ImportMoreVariants($id: ID!, $first: Int!, $after: String) {
          node(id: $id) {
            ... on Product {
              variants(first: $first, after: $after) {
                nodes { id title availableForSale price { amount currencyCode } }
                pageInfo { hasNextPage endCursor }
              }
            }
          }
        }
      `,
      { id: product.id, first: 100, after },
    );
    const nextPage = page.node?.variants;
    if (!nextPage) throw new Error("Shopify did not return all product variants.");
    variants.push(...nextPage.nodes);
    hasNextPage = nextPage.pageInfo.hasNextPage;
    after = nextPage.pageInfo.endCursor;
  }
  if (hasNextPage) throw new Error(`Could not finish importing variants for ${product.title}.`);
  return variants;
}

router.get("/admin/products", async (req, res): Promise<void> => {
  const user = await requireCatalogAdmin(req, res);
  if (!user) return;
  const parsed = ListAdminProductsQueryParams.safeParse(req.query);
  if (!parsed.success || !Number.isInteger(parsed.data.limit) || !Number.isInteger(parsed.data.offset)) {
    res.status(400).json({ error: "Enter a valid product search and page." });
    return;
  }

  const conditions = [];
  if (parsed.data.category?.trim()) conditions.push(eq(milmartsProductsTable.category, parsed.data.category.trim()));
  const search = parsed.data.search?.trim().replace(/[\\%_]/g, "\\$&");
  if (search) {
    const pattern = `%${search}%`;
    conditions.push(or(
      ilike(milmartsProductsTable.title, pattern),
      ilike(milmartsProductsTable.handle, pattern),
      ilike(milmartsProductsTable.description, pattern),
      ilike(milmartsProductsTable.vendor, pattern),
      sql`array_to_string(${milmartsProductsTable.tags}, ' ') ILIKE ${pattern}`,
    )!);
  }
  const where = conditions.length ? and(...conditions) : undefined;
  const [products, totalResult, categoryRows, completedImports, rateSnapshot] = await Promise.all([
    db.select()
      .from(milmartsProductsTable)
      .where(where)
      .orderBy(asc(milmartsProductsTable.title))
      .limit(Math.min(parsed.data.limit, 100))
      .offset(parsed.data.offset),
    db.select({ value: count() }).from(milmartsProductsTable).where(where),
    db.selectDistinct({ category: milmartsProductsTable.category })
      .from(milmartsProductsTable)
      .orderBy(asc(milmartsProductsTable.category)),
    db.select({ id: milmartsAdminAuditLogsTable.id })
      .from(milmartsAdminAuditLogsTable)
      .where(and(
        eq(milmartsAdminAuditLogsTable.action, SHOPIFY_IMPORT_COMPLETED_ACTION),
        eq(milmartsAdminAuditLogsTable.entityType, "product_catalog"),
        eq(milmartsAdminAuditLogsTable.entityId, "shopify"),
      ))
      .limit(1),
    getRateSnapshotOrNull(req),
  ]);
  res.json(ListAdminProductsResponse.parse({
    products: products.map((product) => localProductToResponse(product, rateSnapshot)),
    total: Number(totalResult[0]?.value ?? 0),
    categories: categoryRows.map((row) => row.category),
    shopifyImportCompleted: completedImports.length > 0,
  }));
});

router.post("/admin/products", async (req, res): Promise<void> => {
  const user = await requireCatalogAdmin(req, res);
  if (!user) return;
  const parsed = CreateAdminProductBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter valid product details." });
    return;
  }

  let input: ReturnType<typeof normalizeProductInput>;
  try {
    input = normalizeProductInput(parsed.data);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Enter valid product details." });
    return;
  }
  const handle = await getUniqueHandle(input.handle || input.title);
  try {
    const product = await db.transaction(async (tx) => {
      const [created] = await tx.insert(milmartsProductsTable).values({
        sourceShopifyId: null,
        title: input.title,
        handle,
        description: input.description,
        category: input.category,
        vendor: input.vendor,
        tags: input.tags,
        images: input.images,
        variants: [],
        isPublished: input.isPublished,
      }).returning();
      const variants: MilmartsProductVariant[] = input.variants.map((variant) => ({
        id: newLocalVariantId(created.id),
        title: variant.title,
        availableForSale: variant.availableForSale,
        quantityAvailable: variant.quantityAvailable,
        price: variant.price,
      }));
      const [saved] = await tx.update(milmartsProductsTable)
        .set({ variants })
        .where(eq(milmartsProductsTable.id, created.id))
        .returning();
      return saved;
    });
    const rateSnapshot = await getRateSnapshotOrNull(req);
    res.status(201).json(CreateAdminProductResponse.parse(localProductToResponse(product, rateSnapshot)));
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
      res.status(409).json({ error: "A product with that handle already exists." });
      return;
    }
    req.log.error({ err: error, actorUserId: user.id }, "Failed to create local product");
    res.status(500).json({ error: "We could not save this product." });
  }
});

router.post("/admin/products/import", async (req, res): Promise<void> => {
  const user = await requireCatalogAdmin(req, res);
  if (!user) return;

  try {
    const importedProducts: ShopifyCatalogProduct[] = [];
    let after: string | undefined;
    let hasNextPage = true;
    while (hasNextPage) {
      const page = await importShopifyPage(after);
      importedProducts.push(...page.products.nodes);
      hasNextPage = page.products.pageInfo.hasNextPage;
      after = page.products.pageInfo.endCursor ?? undefined;
      if (importedProducts.length > SHOPIFY_IMPORT_MAX_PRODUCTS) {
        throw new Error(`The Shopify catalog has more than ${SHOPIFY_IMPORT_MAX_PRODUCTS} products. Import it in smaller batches.`);
      }
      if (hasNextPage && !after) throw new Error("Shopify returned an incomplete product page.");
    }

    const sourceIds = importedProducts.map((product) => product.id);
    const alreadyImportedRows = sourceIds.length
      ? await db.select({ sourceShopifyId: milmartsProductsTable.sourceShopifyId })
        .from(milmartsProductsTable)
        .where(inArray(milmartsProductsTable.sourceShopifyId, sourceIds))
      : [];
    const alreadyImported = new Set(alreadyImportedRows.map((row) => row.sourceShopifyId));
    const deletedSourceRows = sourceIds.length
      ? await db.select({ entityId: milmartsAdminAuditLogsTable.entityId })
        .from(milmartsAdminAuditLogsTable)
        .where(and(
          eq(milmartsAdminAuditLogsTable.action, SHOPIFY_IMPORTED_PRODUCT_DELETED_ACTION),
          eq(milmartsAdminAuditLogsTable.entityType, "product"),
          inArray(milmartsAdminAuditLogsTable.entityId, sourceIds),
        ))
      : [];
    const deletedSourceIds = new Set(deletedSourceRows.map((row) => row.entityId));
    const currentHandles = await db.select({ handle: milmartsProductsTable.handle }).from(milmartsProductsTable);
    const usedHandles = new Set(currentHandles.map((row) => row.handle));
    let imported = 0;

    for (const product of importedProducts) {
      if (alreadyImported.has(product.id) || deletedSourceIds.has(product.id)) continue;
      const sourceVariants = await loadRemainingVariants(product);
      if (!sourceVariants.length) continue;
      const baseHandle = slugifyProductHandle(product.handle || product.title) || "milmarts-product";
      let handle = baseHandle;
      let suffix = 2;
      while (usedHandles.has(handle)) {
        const suffixText = `-${suffix++}`;
        handle = `${baseHandle.slice(0, 255 - suffixText.length)}${suffixText}`;
      }
      usedHandles.add(handle);

      await db.transaction(async (tx) => {
        const [created] = await tx.insert(milmartsProductsTable).values({
          sourceShopifyId: product.id,
          title: product.title.trim(),
          handle,
          description: product.description ?? "",
          category: inferCategory(product),
          vendor: product.vendor ?? "",
          tags: product.tags ?? [],
          images: product.images.nodes.map((image) => ({
            url: image.url,
            altText: image.altText ?? null,
          })),
          variants: [],
          isPublished: true,
        }).onConflictDoNothing({ target: milmartsProductsTable.sourceShopifyId }).returning();
        if (!created) return;
        const variants: MilmartsProductVariant[] = sourceVariants.map((variant) => ({
          id: newLocalVariantId(created.id),
          title: variant.title || "Default Title",
          availableForSale: variant.availableForSale,
          quantityAvailable: null,
          price: {
            amount: variant.price.amount,
            currencyCode: variant.price.currencyCode.toUpperCase(),
          },
        }));
        await tx.update(milmartsProductsTable)
          .set({ variants })
          .where(eq(milmartsProductsTable.id, created.id));
        imported += 1;
      });
      alreadyImported.add(product.id);
    }

    const total = importedProducts.length;
    await db.insert(milmartsAdminAuditLogsTable).values({
      actorUserId: user.id,
      action: SHOPIFY_IMPORT_COMPLETED_ACTION,
      entityType: "product_catalog",
      entityId: "shopify",
      details: { imported, skipped: Math.max(0, total - imported), total },
    });
    res.json(ImportAdminShopifyProductsResponse.parse({
      imported,
      skipped: Math.max(0, total - imported),
      total,
    }));
  } catch (error) {
    req.log.error({ err: error, actorUserId: user.id }, "Failed to import Shopify products into local catalog");
    res.status(502).json({
      error: error instanceof Error
        ? `Shopify products could not be imported: ${error.message}`
        : "Shopify products could not be imported right now.",
    });
  }
});

router.patch("/admin/products/:productId", async (req, res): Promise<void> => {
  const user = await requireCatalogAdmin(req, res);
  if (!user) return;
  const params = UpdateAdminProductParams.safeParse(req.params);
  const parsed = UpdateAdminProductBody.safeParse(req.body);
  if (!params.success || !Number.isSafeInteger(params.data.productId) || !parsed.success) {
    res.status(400).json({ error: "Enter valid product details." });
    return;
  }

  const [current] = await db.select()
    .from(milmartsProductsTable)
    .where(eq(milmartsProductsTable.id, params.data.productId))
    .limit(1);
  if (!current) {
    res.status(404).json({ error: "Local product not found." });
    return;
  }

  let normalized: ReturnType<typeof normalizeProductInput>;
  try {
    normalized = normalizeProductInput({
      title: parsed.data.title ?? current.title,
      handle: parsed.data.handle ?? current.handle,
      description: parsed.data.description ?? current.description,
      category: parsed.data.category ?? current.category,
      vendor: parsed.data.vendor ?? current.vendor,
      tags: parsed.data.tags ?? current.tags,
      images: parsed.data.images ?? current.images,
      variants: parsed.data.variants ?? current.variants,
      isPublished: parsed.data.isPublished ?? current.isPublished,
    });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Enter valid product details." });
    return;
  }

  const existingVariantIds = new Set(current.variants.map((variant) => variant.id));
  if (parsed.data.variants?.some((variant) => variant.id && !existingVariantIds.has(variant.id))) {
    res.status(400).json({ error: "Product variants must belong to this local product." });
    return;
  }
  const handle = parsed.data.handle !== undefined
    ? await getUniqueHandle(normalized.handle || normalized.title, current.id)
    : current.handle;
  const variants: MilmartsProductVariant[] = normalized.variants.map((variant, index) => ({
    id: variant.id && existingVariantIds.has(variant.id)
      ? variant.id
      : current.variants[index]?.id ?? newLocalVariantId(current.id),
    title: variant.title,
    availableForSale: variant.availableForSale,
    quantityAvailable: variant.quantityAvailable,
    price: variant.price,
  }));

  try {
    const [updated] = await db.update(milmartsProductsTable)
      .set({
        title: normalized.title,
        handle,
        description: normalized.description,
        category: normalized.category,
        vendor: normalized.vendor,
        tags: normalized.tags,
        images: normalized.images,
        variants,
        isPublished: normalized.isPublished,
      })
      .where(eq(milmartsProductsTable.id, current.id))
      .returning();
    const rateSnapshot = await getRateSnapshotOrNull(req);
    res.json(UpdateAdminProductResponse.parse(localProductToResponse(updated, rateSnapshot)));
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
      res.status(409).json({ error: "A product with that handle already exists." });
      return;
    }
    req.log.error({ err: error, productId: current.id, actorUserId: user.id }, "Failed to update local product");
    res.status(500).json({ error: "We could not save this product." });
  }
});

router.delete("/admin/products/:productId", async (req, res): Promise<void> => {
  const user = await requireCatalogAdmin(req, res);
  if (!user) return;
  const params = DeleteAdminProductParams.safeParse(req.params);
  if (!params.success || !Number.isSafeInteger(params.data.productId)) {
    res.status(400).json({ error: "Enter a valid product ID." });
    return;
  }
  const [current] = await db.select()
    .from(milmartsProductsTable)
    .where(eq(milmartsProductsTable.id, params.data.productId))
    .limit(1);
  if (!current) {
    res.status(404).json({ error: "Local product not found." });
    return;
  }
  await db.transaction(async (tx) => {
    if (current.sourceShopifyId) {
      await tx.insert(milmartsAdminAuditLogsTable).values({
        actorUserId: user.id,
        action: SHOPIFY_IMPORTED_PRODUCT_DELETED_ACTION,
        entityType: "product",
        entityId: current.sourceShopifyId,
        details: { localProductId: current.id, title: current.title },
      });
    }
    await tx.delete(milmartsProductsTable)
      .where(eq(milmartsProductsTable.id, current.id));
  });
  res.json(DeleteAdminProductResponse.parse({ deleted: true }));
});

export default router;
