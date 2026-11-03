import { createInsertSchema } from "drizzle-zod";
import { integer, pgTable, serial, text } from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { milmartsOrdersTable } from "./milmarts-orders";

export const milmartsOrderItemsTable = pgTable("milmarts_order_items", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id")
    .notNull()
    .references(() => milmartsOrdersTable.id, { onDelete: "cascade" }),
  merchandiseId: text("merchandise_id").notNull(),
  title: text("title").notNull(),
  quantity: integer("quantity").notNull(),
  unitPriceKobo: integer("unit_price_kobo").notNull(),
  lineTotalKobo: integer("line_total_kobo").notNull(),
});

export const insertMilmartsOrderItemSchema = createInsertSchema(milmartsOrderItemsTable).omit({
  id: true,
});

export type InsertMilmartsOrderItem = z.infer<typeof insertMilmartsOrderItemSchema>;
export type MilmartsOrderItem = typeof milmartsOrderItemsTable.$inferSelect;
