import {
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const milmartsUsersTable = pgTable(
  "milmarts_users",
  {
    id: serial("id").primaryKey(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    phone: text("phone").notNull(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    walletBalanceKobo: integer("wallet_balance_kobo").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    emailIndex: uniqueIndex("milmarts_users_email_idx").on(table.email),
  }),
);

export const milmartsAuthSessionsTable = pgTable("milmarts_auth_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => milmartsUsersTable.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const milmartsWalletTransactionsTable = pgTable("milmarts_wallet_transactions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => milmartsUsersTable.id, { onDelete: "cascade" }),
  amountKobo: integer("amount_kobo").notNull(),
  type: text("type").notNull().default("funding"),
  reference: text("reference"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const milmartsWalletFundingPaymentsTable = pgTable(
  "milmarts_wallet_funding_payments",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => milmartsUsersTable.id, { onDelete: "cascade" }),
    txRef: text("tx_ref").notNull(),
    amountKobo: integer("amount_kobo").notNull(),
    status: text("status").notNull().default("pending"),
    flutterwaveTransactionId: text("flutterwave_transaction_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => ({
    txRefIndex: uniqueIndex("milmarts_wallet_funding_payments_tx_ref_idx").on(table.txRef),
  }),
);

export type MilmartsUser = typeof milmartsUsersTable.$inferSelect;