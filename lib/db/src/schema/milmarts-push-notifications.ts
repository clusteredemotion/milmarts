import { index, integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { milmartsUsersTable } from "./milmarts-auth";

export const milmartsPushSubscriptionsTable = pgTable(
  "milmarts_push_subscriptions",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => milmartsUsersTable.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    endpointIndex: uniqueIndex("milmarts_push_subscriptions_endpoint_idx").on(table.endpoint),
    userIndex: index("milmarts_push_subscriptions_user_idx").on(table.userId),
  }),
);

export const milmartsPushNotificationsTable = pgTable(
  "milmarts_push_notifications",
  {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    targetPath: text("target_path").notNull().default("/"),
    recipientCount: integer("recipient_count").notNull().default(0),
    sentCount: integer("sent_count").notNull().default(0),
    failedCount: integer("failed_count").notNull().default(0),
    createdByUserId: integer("created_by_user_id")
      .notNull()
      .references(() => milmartsUsersTable.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    createdAtIndex: index("milmarts_push_notifications_created_at_idx").on(table.createdAt),
  }),
);

export type MilmartsPushSubscription = typeof milmartsPushSubscriptionsTable.$inferSelect;
export type MilmartsPushNotification = typeof milmartsPushNotificationsTable.$inferSelect;
