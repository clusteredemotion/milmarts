import { createInsertSchema } from "drizzle-zod";
import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { milmartsUsersTable } from "./milmarts-auth";
import { milmartsOrdersTable } from "./milmarts-orders";

export const milmartsOrderTrackingEventsTable = pgTable("milmarts_order_tracking_events", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id")
    .notNull()
    .references(() => milmartsOrdersTable.id, { onDelete: "cascade" }),
  status: text("status").notNull(),
  message: text("message").notNull(),
  location: text("location"),
  createdByUserId: integer("created_by_user_id")
    .notNull()
    .references(() => milmartsUsersTable.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertMilmartsOrderTrackingEventSchema = createInsertSchema(milmartsOrderTrackingEventsTable).omit({
  id: true,
  createdAt: true,
});

export type InsertMilmartsOrderTrackingEvent = z.infer<typeof insertMilmartsOrderTrackingEventSchema>;
export type MilmartsOrderTrackingEvent = typeof milmartsOrderTrackingEventsTable.$inferSelect;
