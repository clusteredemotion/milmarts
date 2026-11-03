import { createInsertSchema } from "drizzle-zod";
import { boolean, integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { milmartsUsersTable } from "./milmarts-auth";

export const milmartsOrdersTable = pgTable(
  "milmarts_orders",
  {
    id: serial("id").primaryKey(),
    orderNumber: text("order_number").notNull(),
    userId: integer("user_id")
      .notNull()
      .references(() => milmartsUsersTable.id, { onDelete: "cascade" }),
    idempotencyKey: text("idempotency_key").notNull(),
    status: text("status").notNull().default("awaiting_payment"),
    paymentMethod: text("payment_method").notNull(),
    paymentStatus: text("payment_status").notNull().default("pending"),
    currencyCode: text("currency_code").notNull().default("NGN"),
    subtotalKobo: integer("subtotal_kobo").notNull(),
    deliveryFeeKobo: integer("delivery_fee_kobo").notNull().default(0),
    totalKobo: integer("total_kobo").notNull(),
    deliveryPricingPending: boolean("delivery_pricing_pending").notNull().default(true),
    fulfillmentStatus: text("fulfillment_status").notNull().default("processing"),
    trackingCarrier: text("tracking_carrier"),
    trackingNumber: text("tracking_number"),
    trackingUrl: text("tracking_url"),
    shippingFullName: text("shipping_full_name").notNull(),
    shippingPhone: text("shipping_phone").notNull(),
    shippingAddress1: text("shipping_address1").notNull(),
    shippingAddress2: text("shipping_address2"),
    shippingCity: text("shipping_city").notNull(),
    shippingRegion: text("shipping_region").notNull(),
    shippingPostalCode: text("shipping_postal_code"),
    shippingCountry: text("shipping_country").notNull(),
    flutterwaveTxRef: text("flutterwave_tx_ref"),
    flutterwaveTransactionId: text("flutterwave_transaction_id"),
    flutterwavePaymentUrl: text("flutterwave_payment_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
  },
  (table) => ({
    orderNumberIndex: uniqueIndex("milmarts_orders_order_number_idx").on(table.orderNumber),
    userIdempotencyIndex: uniqueIndex("milmarts_orders_user_idempotency_idx").on(table.userId, table.idempotencyKey),
    flutterwaveTxRefIndex: uniqueIndex("milmarts_orders_flutterwave_tx_ref_idx").on(table.flutterwaveTxRef),
  }),
);

export const insertMilmartsOrderSchema = createInsertSchema(milmartsOrdersTable).omit({
  id: true,
  createdAt: true,
  paidAt: true,
});

export type InsertMilmartsOrder = z.infer<typeof insertMilmartsOrderSchema>;
export type MilmartsOrder = typeof milmartsOrdersTable.$inferSelect;
