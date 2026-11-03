import { Router, type Request, type Response } from "express";
import { and, count, desc, eq, ilike, ne, or, sql, sum } from "drizzle-orm";
import {
  db,
  milmartsAdminAuditLogsTable,
  milmartsAdminStaffTable,
  milmartsOrdersTable,
  milmartsUsersTable,
  milmartsWalletFundingPaymentsTable,
  milmartsWalletTransactionsTable,
} from "@workspace/db";
import {
  AssignAdminStaffBody,
  ListAdminUsersQueryParams,
  RevokeAdminStaffParams,
  UpdateAdminUserBody,
  UpdateAdminUserParams,
} from "@workspace/api-zod";
import { isMilmartsAdmin, isMilmartsRootAdmin } from "../lib/milmarts-admin";
import { getAuthenticatedUser } from "./auth";

const router = Router();
const maxPageSize = 100;

async function requireAdmin(req: Request, res: Response) {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    res.status(401).json({ error: "Log in to access the admin dashboard." });
    return null;
  }
  if (!(await isMilmartsAdmin(user.id))) {
    res.status(403).json({ error: "Milmarts staff access is required." });
    return null;
  }
  return user;
}

async function requirePrimaryAdmin(req: Request, res: Response) {
  const user = await requireAdmin(req, res);
  if (!user) return null;
  if (!isMilmartsRootAdmin(user.id)) {
    res.status(403).json({ error: "Only the primary administrator can manage staff access." });
    return null;
  }
  return user;
}

function userName(firstName: string, lastName: string) {
  return `${firstName} ${lastName}`.trim();
}

router.get("/admin/dashboard", async (req, res): Promise<void> => {
  const user = await requireAdmin(req, res);
  if (!user) return;

  const [users, staff, orders, walletTransactions, pendingFunding, walletBalance] = await Promise.all([
    db.select({ value: count() }).from(milmartsUsersTable),
    db.select({ value: count() }).from(milmartsAdminStaffTable).where(eq(milmartsAdminStaffTable.isActive, true)),
    db.select({ value: count() }).from(milmartsOrdersTable).where(eq(milmartsOrdersTable.paymentStatus, "paid")),
    db.select({ value: count() }).from(milmartsWalletTransactionsTable),
    db.select({ value: count() }).from(milmartsWalletFundingPaymentsTable).where(eq(milmartsWalletFundingPaymentsTable.status, "pending")),
    db.select({ value: sum(milmartsUsersTable.walletBalanceKobo) }).from(milmartsUsersTable),
  ]);

  res.json({
    userCount: Number(users[0]?.value ?? 0),
    activeStaffCount: Number(staff[0]?.value ?? 0) + (
      Number.isSafeInteger(Number(process.env.MILMARTS_ADMIN_USER_ID))
      && Number(process.env.MILMARTS_ADMIN_USER_ID) > 0
        ? 1
        : 0
    ),
    paidOrderCount: Number(orders[0]?.value ?? 0),
    walletTransactionCount: Number(walletTransactions[0]?.value ?? 0),
    pendingFundingCount: Number(pendingFunding[0]?.value ?? 0),
    walletBalanceTotalKobo: Number(walletBalance[0]?.value ?? 0),
  });
});

router.get("/admin/users", async (req, res): Promise<void> => {
  const user = await requireAdmin(req, res);
  if (!user) return;
  const parsed = ListAdminUsersQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter a valid customer search and page." });
    return;
  }

  const { search: rawSearch, limit = 50, offset = 0 } = parsed.data;
  if (!Number.isInteger(limit) || !Number.isInteger(offset)) {
    res.status(400).json({ error: "Page size and offset must be whole numbers." });
    return;
  }
  const search = rawSearch?.trim();
  const escaped = search?.replace(/[\\%_]/g, "\\$&");
  const pattern = escaped ? `%${escaped}%` : null;
  const where = pattern
    ? or(
      ilike(milmartsUsersTable.firstName, pattern),
      ilike(milmartsUsersTable.lastName, pattern),
      ilike(milmartsUsersTable.email, pattern),
      ilike(milmartsUsersTable.phone, pattern),
    )
    : undefined;
  const [users, total] = await Promise.all([
    db.select({
      id: milmartsUsersTable.id,
      firstName: milmartsUsersTable.firstName,
      lastName: milmartsUsersTable.lastName,
      email: milmartsUsersTable.email,
      phone: milmartsUsersTable.phone,
      walletBalanceKobo: milmartsUsersTable.walletBalanceKobo,
      createdAt: milmartsUsersTable.createdAt,
    })
      .from(milmartsUsersTable)
      .where(where)
      .orderBy(desc(milmartsUsersTable.createdAt))
      .limit(Math.min(limit, maxPageSize))
      .offset(offset),
    db.select({ value: count() }).from(milmartsUsersTable).where(where),
  ]);
  res.json({ users, total: Number(total[0]?.value ?? 0) });
});

router.patch("/admin/users/:userId", async (req, res): Promise<void> => {
  const actor = await requireAdmin(req, res);
  if (!actor) return;

  const params = UpdateAdminUserParams.safeParse(req.params);
  const bodySource = req.body && typeof req.body === "object" ? req.body as Record<string, unknown> : {};
  const body = UpdateAdminUserBody.safeParse({
    ...bodySource,
    firstName: typeof bodySource.firstName === "string" ? bodySource.firstName.trim() : bodySource.firstName,
    lastName: typeof bodySource.lastName === "string" ? bodySource.lastName.trim() : bodySource.lastName,
    email: typeof bodySource.email === "string" ? bodySource.email.trim().toLowerCase() : bodySource.email,
    phone: typeof bodySource.phone === "string" ? bodySource.phone.trim() : bodySource.phone,
  });
  if (!params.success || !Number.isInteger(params.data.userId) || !body.success) {
    res.status(400).json({ error: "Enter valid name, email, and phone details." });
    return;
  }

  const targetUserId = params.data.userId;
  const [currentUser] = await db.select()
    .from(milmartsUsersTable)
    .where(eq(milmartsUsersTable.id, targetUserId))
    .limit(1);
  if (!currentUser) {
    res.status(404).json({ error: "Customer account not found." });
    return;
  }

  const input = body.data;
  const updatedFields = [
    input.firstName !== currentUser.firstName ? "firstName" : null,
    input.lastName !== currentUser.lastName ? "lastName" : null,
    input.email !== currentUser.email ? "email" : null,
    input.phone !== currentUser.phone ? "phone" : null,
  ].filter((field): field is string => Boolean(field));
  if (!updatedFields.length) {
    res.json({
      id: currentUser.id,
      firstName: currentUser.firstName,
      lastName: currentUser.lastName,
      email: currentUser.email,
      phone: currentUser.phone,
      walletBalanceKobo: currentUser.walletBalanceKobo,
      createdAt: currentUser.createdAt,
    });
    return;
  }

  const [duplicateEmail] = await db.select({ id: milmartsUsersTable.id })
    .from(milmartsUsersTable)
    .where(and(
      sql`lower(${milmartsUsersTable.email}) = ${input.email}`,
      ne(milmartsUsersTable.id, targetUserId),
    ))
    .limit(1);
  if (duplicateEmail) {
    res.status(409).json({ error: "That email address is already used by another account." });
    return;
  }

  try {
    const updated = await db.transaction(async (tx) => {
      const [record] = await tx.update(milmartsUsersTable)
        .set({
          firstName: input.firstName,
          lastName: input.lastName,
          email: input.email,
          phone: input.phone,
        })
        .where(eq(milmartsUsersTable.id, targetUserId))
        .returning({
          id: milmartsUsersTable.id,
          firstName: milmartsUsersTable.firstName,
          lastName: milmartsUsersTable.lastName,
          email: milmartsUsersTable.email,
          phone: milmartsUsersTable.phone,
          walletBalanceKobo: milmartsUsersTable.walletBalanceKobo,
          createdAt: milmartsUsersTable.createdAt,
        });
      await tx.insert(milmartsAdminAuditLogsTable).values({
        actorUserId: actor.id,
        action: "update_user_profile",
        entityType: "user",
        entityId: String(targetUserId),
        details: { updatedFields },
      });
      return record;
    });
    res.json(updated);
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "23505") {
      res.status(409).json({ error: "That email address is already used by another account." });
      return;
    }
    req.log.error({ err: error, targetUserId }, "Failed to update customer profile");
    res.status(500).json({ error: "We could not update this account." });
  }
});

router.get("/admin/transactions", async (req, res): Promise<void> => {
  const user = await requireAdmin(req, res);
  if (!user) return;

  const [walletRows, fundingRows, orderRows] = await Promise.all([
    db.select({
      id: milmartsWalletTransactionsTable.id,
      userId: milmartsUsersTable.id,
      firstName: milmartsUsersTable.firstName,
      lastName: milmartsUsersTable.lastName,
      email: milmartsUsersTable.email,
      amountKobo: milmartsWalletTransactionsTable.amountKobo,
      type: milmartsWalletTransactionsTable.type,
      reference: milmartsWalletTransactionsTable.reference,
      createdAt: milmartsWalletTransactionsTable.createdAt,
    })
      .from(milmartsWalletTransactionsTable)
      .innerJoin(milmartsUsersTable, eq(milmartsUsersTable.id, milmartsWalletTransactionsTable.userId))
      .orderBy(desc(milmartsWalletTransactionsTable.createdAt))
      .limit(100),
    db.select({
      id: milmartsWalletFundingPaymentsTable.id,
      userId: milmartsUsersTable.id,
      firstName: milmartsUsersTable.firstName,
      lastName: milmartsUsersTable.lastName,
      email: milmartsUsersTable.email,
      txRef: milmartsWalletFundingPaymentsTable.txRef,
      amountKobo: milmartsWalletFundingPaymentsTable.amountKobo,
      status: milmartsWalletFundingPaymentsTable.status,
      flutterwaveTransactionId: milmartsWalletFundingPaymentsTable.flutterwaveTransactionId,
      createdAt: milmartsWalletFundingPaymentsTable.createdAt,
      completedAt: milmartsWalletFundingPaymentsTable.completedAt,
    })
      .from(milmartsWalletFundingPaymentsTable)
      .innerJoin(milmartsUsersTable, eq(milmartsUsersTable.id, milmartsWalletFundingPaymentsTable.userId))
      .orderBy(desc(milmartsWalletFundingPaymentsTable.createdAt))
      .limit(100),
    db.select({
      id: milmartsOrdersTable.id,
      orderNumber: milmartsOrdersTable.orderNumber,
      userId: milmartsUsersTable.id,
      firstName: milmartsUsersTable.firstName,
      lastName: milmartsUsersTable.lastName,
      email: milmartsUsersTable.email,
      paymentMethod: milmartsOrdersTable.paymentMethod,
      paymentStatus: milmartsOrdersTable.paymentStatus,
      totalKobo: milmartsOrdersTable.totalKobo,
      createdAt: milmartsOrdersTable.createdAt,
      paidAt: milmartsOrdersTable.paidAt,
    })
      .from(milmartsOrdersTable)
      .innerJoin(milmartsUsersTable, eq(milmartsUsersTable.id, milmartsOrdersTable.userId))
      .orderBy(desc(milmartsOrdersTable.createdAt))
      .limit(100),
  ]);

  res.json({
    walletTransactions: walletRows.map(({ firstName, lastName, ...transaction }) => ({
      ...transaction,
      userName: userName(firstName, lastName),
    })),
    fundingPayments: fundingRows.map(({ firstName, lastName, ...payment }) => ({
      ...payment,
      userName: userName(firstName, lastName),
    })),
    orderPayments: orderRows.map(({ firstName, lastName, ...order }) => ({
      ...order,
      userName: userName(firstName, lastName),
    })),
  });
});

router.get("/admin/staff", async (req, res): Promise<void> => {
  const actor = await requireAdmin(req, res);
  if (!actor) return;

  const staffRows = await db.select({
    userId: milmartsAdminStaffTable.userId,
    firstName: milmartsUsersTable.firstName,
    lastName: milmartsUsersTable.lastName,
    email: milmartsUsersTable.email,
    isActive: milmartsAdminStaffTable.isActive,
    assignedBy: milmartsAdminStaffTable.assignedBy,
    assignedAt: milmartsAdminStaffTable.assignedAt,
    revokedAt: milmartsAdminStaffTable.revokedAt,
  })
    .from(milmartsAdminStaffTable)
    .innerJoin(milmartsUsersTable, eq(milmartsUsersTable.id, milmartsAdminStaffTable.userId))
    .orderBy(desc(milmartsAdminStaffTable.assignedAt));

  const primaryAdminId = Number(process.env.MILMARTS_ADMIN_USER_ID);
  const [primaryAdmin] = Number.isSafeInteger(primaryAdminId) && primaryAdminId > 0
    ? await db.select({
      id: milmartsUsersTable.id,
      firstName: milmartsUsersTable.firstName,
      lastName: milmartsUsersTable.lastName,
      email: milmartsUsersTable.email,
    }).from(milmartsUsersTable).where(eq(milmartsUsersTable.id, primaryAdminId)).limit(1)
    : [];

  const staff: Array<{
    userId: number;
    firstName: string;
    lastName: string;
    email: string;
    isActive: boolean;
    isPrimaryAdmin: boolean;
    assignedBy: number | null;
    assignedAt: Date | null;
    revokedAt: Date | null;
  }> = staffRows.map((member) => ({
    userId: member.userId,
    firstName: member.firstName,
    lastName: member.lastName,
    email: member.email,
    isActive: member.isActive,
    isPrimaryAdmin: false,
    assignedBy: member.assignedBy,
    assignedAt: member.assignedAt,
    revokedAt: member.revokedAt,
  }));
  if (primaryAdmin && !staff.some((member) => member.userId === primaryAdmin.id)) {
    staff.unshift({
      userId: primaryAdmin.id,
      firstName: primaryAdmin.firstName,
      lastName: primaryAdmin.lastName,
      email: primaryAdmin.email,
      isActive: true,
      isPrimaryAdmin: true,
      assignedBy: null,
      assignedAt: null,
      revokedAt: null,
    });
  }
  res.json({ staff, canManageStaff: isMilmartsRootAdmin(actor.id) });
});

router.post("/admin/staff", async (req, res): Promise<void> => {
  const actor = await requirePrimaryAdmin(req, res);
  if (!actor) return;
  const parsed = AssignAdminStaffBody.safeParse(req.body);
  if (!parsed.success || !Number.isInteger(parsed.data.userId)) {
    res.status(400).json({ error: "Choose a valid customer account to assign." });
    return;
  }

  const targetUserId = parsed.data.userId;
  if (isMilmartsRootAdmin(targetUserId)) {
    res.status(400).json({ error: "The primary administrator already has staff access." });
    return;
  }
  const [target] = await db.select({
    id: milmartsUsersTable.id,
    firstName: milmartsUsersTable.firstName,
    lastName: milmartsUsersTable.lastName,
    email: milmartsUsersTable.email,
  }).from(milmartsUsersTable).where(eq(milmartsUsersTable.id, targetUserId)).limit(1);
  if (!target) {
    res.status(404).json({ error: "Customer account not found." });
    return;
  }

  const now = new Date();
  const assignment = await db.transaction(async (tx) => {
    const [staffRecord] = await tx.insert(milmartsAdminStaffTable)
      .values({ userId: targetUserId, assignedBy: actor.id, isActive: true, assignedAt: now, revokedAt: null })
      .onConflictDoUpdate({
        target: milmartsAdminStaffTable.userId,
        set: { assignedBy: actor.id, isActive: true, assignedAt: now, revokedAt: null },
      })
      .returning();
    await tx.insert(milmartsAdminAuditLogsTable).values({
      actorUserId: actor.id,
      action: "assign_staff_access",
      entityType: "user",
      entityId: String(targetUserId),
      details: {},
    });
    return staffRecord;
  });

  res.status(200).json({
    userId: target.id,
    firstName: target.firstName,
    lastName: target.lastName,
    email: target.email,
    isActive: assignment.isActive,
    isPrimaryAdmin: false,
    assignedBy: assignment.assignedBy,
    assignedAt: assignment.assignedAt,
    revokedAt: assignment.revokedAt,
  });
});

router.delete("/admin/staff/:userId", async (req, res): Promise<void> => {
  const actor = await requirePrimaryAdmin(req, res);
  if (!actor) return;
  const parsed = RevokeAdminStaffParams.safeParse(req.params);
  if (!parsed.success || !Number.isInteger(parsed.data.userId)) {
    res.status(400).json({ error: "Choose a valid staff account." });
    return;
  }

  const targetUserId = parsed.data.userId;
  if (isMilmartsRootAdmin(targetUserId)) {
    res.status(403).json({ error: "Primary administrator access cannot be revoked here." });
    return;
  }
  const [assignment] = await db.select({ userId: milmartsAdminStaffTable.userId })
    .from(milmartsAdminStaffTable)
    .where(and(
      eq(milmartsAdminStaffTable.userId, targetUserId),
      eq(milmartsAdminStaffTable.isActive, true),
    ))
    .limit(1);
  if (!assignment) {
    res.status(404).json({ error: "Active staff assignment not found." });
    return;
  }

  await db.transaction(async (tx) => {
    await tx.update(milmartsAdminStaffTable)
      .set({ isActive: false, revokedAt: new Date() })
      .where(eq(milmartsAdminStaffTable.userId, targetUserId));
    await tx.insert(milmartsAdminAuditLogsTable).values({
      actorUserId: actor.id,
      action: "revoke_staff_access",
      entityType: "user",
      entityId: String(targetUserId),
      details: {},
    });
  });
  res.json({ userId: targetUserId, isActive: false });
});

export default router;
