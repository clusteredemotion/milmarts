import { createInsertSchema } from "drizzle-zod";
import { boolean, index, jsonb, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { z } from "zod/v4";

export type MilmartsProductImage = {
  url: string;
  altText?: string | null;
};

export type MilmartsProductMoney = {
  amount: string;
  currencyCode: string;
};

export type MilmartsProductVariant = {
  id: string;
  title: string;
  availableForSale: boolean;
  quantityAvailable?: number | null;
  price: MilmartsProductMoney;
};

export const milmartsProductsTable = pgTable(
  "milmarts_products",
  {
    id: serial("id").primaryKey(),
    sourceShopifyId: text("source_shopify_id"),
    title: text("title").notNull(),
    handle: text("handle").notNull(),
    description: text("description").notNull().default(""),
    category: text("category").notNull().default("Official stores"),
    vendor: text("vendor").notNull().default(""),
    tags: text("tags").array().notNull().default(sql`ARRAY[]::text[]`),
    images: jsonb("images").$type<MilmartsProductImage[]>().notNull().default(sql`'[]'::jsonb`),
    variants: jsonb("variants").$type<MilmartsProductVariant[]>().notNull().default(sql`'[]'::jsonb`),
    isPublished: boolean("is_published").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => ({
    handleIndex: uniqueIndex("milmarts_products_handle_idx").on(table.handle),
    sourceShopifyIdIndex: uniqueIndex("milmarts_products_shopify_source_idx").on(table.sourceShopifyId),
    categoryIndex: index("milmarts_products_category_idx").on(table.category),
    publishedIndex: index("milmarts_products_published_idx").on(table.isPublished),
  }),
);

export const insertMilmartsProductSchema = createInsertSchema(milmartsProductsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertMilmartsProduct = z.infer<typeof insertMilmartsProductSchema>;
export type MilmartsProduct = typeof milmartsProductsTable.$inferSelect;
