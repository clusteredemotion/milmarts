import { boolean, integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { milmartsUsersTable } from "./milmarts-auth";

export const milmartsAdminStaffTable = pgTable(
  "milmarts_admin_staff",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => milmartsUsersTable.id, { onDelete: "restrict" }),
    assignedBy: integer("assigned_by")
      .notNull()
      .references(() => milmartsUsersTable.id, { onDelete: "restrict" }),
    isActive: boolean("is_active").notNull().default(true),
    assignedAt: timestamp("assigned_at", { withTimezone: true }).defaultNow().notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => ({
    userIdIndex: uniqueIndex("milmarts_admin_staff_user_id_idx").on(table.userId),
  }),
);

export const milmartsAdminAuditLogsTable = pgTable("milmarts_admin_audit_logs", {
  id: serial("id").primaryKey(),
  actorUserId: integer("actor_user_id")
    .notNull()
    .references(() => milmartsUsersTable.id, { onDelete: "restrict" }),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
