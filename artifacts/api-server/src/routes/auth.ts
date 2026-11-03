import crypto from "node:crypto";
import { promisify } from "node:util";
import { Router, type Request, type Response } from "express";
import { and, desc, eq, gt, sql } from "drizzle-orm";
import {
  db,
  milmartsAuthSessionsTable,
  milmartsUsersTable,
  milmartsWalletFundingPaymentsTable,
  milmartsWalletTransactionsTable,
} from "@workspace/db";

const router = Router();
const scrypt = promisify(crypto.scrypt);
const SESSION_COOKIE = "milmarts_session";
const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 30;
const FLUTTERWAVE_API_URL = "https://api.flutterwave.com/v3";

type PublicUser = {
  id: number;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  walletBalanceKobo: number;
};

function normalizeEmail(email: unknown) {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

function publicUser(user: typeof milmartsUsersTable.$inferSelect): PublicUser {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    email: user.email,
    walletBalanceKobo: user.walletBalanceKobo,
  };
}

async function hashPassword(password: string, salt = crypto.randomBytes(16).toString("hex")) {
  const derivedKey = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}:${derivedKey.toString("hex")}`;
}

async function verifyPassword(password: string, storedHash: string) {
  const [salt, key] = storedHash.split(":");
  if (!salt || !key) return false;
  const expected = (await scrypt(password, salt, 64)) as Buffer;
  const actual = Buffer.from(key, "hex");
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function tokenHash(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function setSessionCookie(res: Response, token: string) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_DURATION_MS,
    path: "/",
  });
}

async function createSession(userId: number, res: Response) {
  const token = crypto.randomBytes(32).toString("hex");
  await db.insert(milmartsAuthSessionsTable).values({
    tokenHash: tokenHash(token),
    userId,
    expiresAt: new Date(Date.now() + SESSION_DURATION_MS),
  });
  setSessionCookie(res, token);
}

export function getRequestOrigin(req: Request) {
  const protocol = req.get("x-forwarded-proto")?.split(",")[0]?.trim() || req.protocol;
  const host = req.get("x-forwarded-host")?.split(",")[0]?.trim() || req.get("host");
  return host ? `${protocol}://${host}` : "";
}

function getFlutterwaveSecret() {
  return process.env.FLW_SECRET_KEY?.trim() || "";
}

export async function flutterwaveRequest(path: string, init: RequestInit) {
  const secret = getFlutterwaveSecret();
  if (!secret) throw new Error("Flutterwave is not configured.");

  return fetch(`${FLUTTERWAVE_API_URL}${path}`, {
    ...init,
    signal: AbortSignal.timeout(15_000),
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

function walletRedirect(res: Response, req: Request, status: "success" | "cancelled" | "failed", embedded = false) {
  const origin = getRequestOrigin(req);
  if (!origin) {
    res.status(500).send("Payment completed, but we could not return you to Milmarts.");
    return;
  }
  if (embedded) {
    const messageStatus = JSON.stringify(status);
    const targetOrigin = JSON.stringify(origin);
    res.type("html").send(`<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Milmarts payment</title></head>
  <body style="margin:0;display:grid;min-height:100vh;place-items:center;background:#fff8f6;color:#282326;font:16px system-ui,sans-serif">
    <main style="max-width:28rem;padding:2rem;text-align:center">
      <strong style="color:#be1e3e">Milmarts</strong>
      <h1 style="font:700 1.8rem Georgia,serif">Payment ${status === "success" ? "confirmed" : status === "cancelled" ? "cancelled" : "could not be verified"}</h1>
      <p>You can close this payment window and continue on your Milmarts dashboard.</p>
    </main>
    <script>
      window.parent.postMessage({ type: "milmarts-wallet-payment", status: ${messageStatus} }, ${targetOrigin});
    </script>
  </body>
</html>`);
    return;
  }
  res.redirect(`${origin}/account?wallet=${status}`);
}

async function verifyAndCreditWallet(txRef: string, transactionId?: string) {
  const [payment] = await db.select()
    .from(milmartsWalletFundingPaymentsTable)
    .where(eq(milmartsWalletFundingPaymentsTable.txRef, txRef))
    .limit(1);
  if (!payment || payment.status === "failed") return { ok: false as const };
  if (payment.status === "paid") {
    return { ok: true as const, credited: false, userId: payment.userId, amountKobo: payment.amountKobo };
  }

  const verifyPath = transactionId
    ? `/transactions/${encodeURIComponent(transactionId)}/verify`
    : `/transactions/verify_by_reference?tx_ref=${encodeURIComponent(txRef)}`;
  const response = await flutterwaveRequest(verifyPath, {
    method: "GET",
  });
  const body = await response.json().catch(() => null) as {
    status?: string;
    data?: {
      id?: number | string;
      status?: string;
      amount?: number;
      currency?: string;
      tx_ref?: string;
    };
  } | null;
  const verified = body?.status === "success"
    && body.data?.status === "successful"
    && body.data.tx_ref === payment.txRef
    && body.data.currency === "NGN"
    && Number.isFinite(Number(body.data.amount))
    && Math.round(Number(body.data.amount) * 100) === payment.amountKobo
    && body.data.id !== undefined
    && (!transactionId || String(body.data.id) === transactionId);
  if (!response.ok || !verified) return { ok: false as const };
  const verifiedTransactionId = String(body.data!.id);

  const completed = await db.transaction(async (tx) => {
    const [claimedPayment] = await tx.update(milmartsWalletFundingPaymentsTable)
      .set({
        status: "paid",
        flutterwaveTransactionId: verifiedTransactionId,
        completedAt: new Date(),
      })
      .where(and(
        eq(milmartsWalletFundingPaymentsTable.id, payment.id),
        eq(milmartsWalletFundingPaymentsTable.status, "pending"),
      ))
      .returning();
    if (!claimedPayment) return false;

    await tx.update(milmartsUsersTable)
      .set({ walletBalanceKobo: sql`${milmartsUsersTable.walletBalanceKobo} + ${payment.amountKobo}` })
      .where(eq(milmartsUsersTable.id, payment.userId));
    await tx.insert(milmartsWalletTransactionsTable).values({
      userId: payment.userId,
      amountKobo: payment.amountKobo,
      type: "flutterwave_funding",
    });
    return true;
  });

  if (completed) return { ok: true as const, credited: true, userId: payment.userId, amountKobo: payment.amountKobo };
  const [alreadyCompleted] = await db.select({
    status: milmartsWalletFundingPaymentsTable.status,
  }).from(milmartsWalletFundingPaymentsTable)
    .where(eq(milmartsWalletFundingPaymentsTable.id, payment.id))
    .limit(1);
  return alreadyCompleted?.status === "paid"
    ? { ok: true as const, credited: false, userId: payment.userId, amountKobo: payment.amountKobo }
    : { ok: false as const };
}

export async function getAuthenticatedUser(req: Request) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) return null;

  const [result] = await db
    .select({ user: milmartsUsersTable, session: milmartsAuthSessionsTable })
    .from(milmartsAuthSessionsTable)
    .innerJoin(milmartsUsersTable, eq(milmartsUsersTable.id, milmartsAuthSessionsTable.userId))
    .where(and(eq(milmartsAuthSessionsTable.tokenHash, tokenHash(token)), gt(milmartsAuthSessionsTable.expiresAt, new Date())))
    .limit(1);

  return result?.user ?? null;
}

function requireFields(body: unknown) {
  if (!body || typeof body !== "object") return null;
  const values = body as Record<string, unknown>;
  const firstName = typeof values.firstName === "string" ? values.firstName.trim() : "";
  const lastName = typeof values.lastName === "string" ? values.lastName.trim() : "";
  const phone = typeof values.phone === "string" ? values.phone.trim() : "";
  const email = normalizeEmail(values.email);
  const password = typeof values.password === "string" ? values.password : "";
  if (!firstName || !lastName || !phone || !email || !password) return null;
  if (!email.includes("@") || password.length < 8) return null;
  return { firstName, lastName, phone, email, password };
}

router.post("/auth/signup", async (req, res): Promise<void> => {
  const input = requireFields(req.body);
  if (!input) {
    res.status(400).json({ error: "Enter your first name, last name, phone number, email, and a password of at least 8 characters." });
    return;
  }

  const [existing] = await db.select({ id: milmartsUsersTable.id }).from(milmartsUsersTable).where(eq(milmartsUsersTable.email, input.email)).limit(1);
  if (existing) {
    res.status(409).json({ error: "An account with that email already exists. Log in instead." });
    return;
  }

  const [user] = await db.insert(milmartsUsersTable).values({
    firstName: input.firstName,
    lastName: input.lastName,
    phone: input.phone,
    email: input.email,
    passwordHash: await hashPassword(input.password),
  }).returning();

  await createSession(user.id, res);
  res.status(201).json({ user: publicUser(user) });
});

router.post("/auth/login", async (req, res): Promise<void> => {
  const email = normalizeEmail(req.body?.email);
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (!email || !password) {
    res.status(400).json({ error: "Enter your email and password." });
    return;
  }

  const [user] = await db.select().from(milmartsUsersTable).where(eq(milmartsUsersTable.email, email)).limit(1);
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    res.status(401).json({ error: "Those login details do not match our records." });
    return;
  }

  await createSession(user.id, res);
  res.json({ user: publicUser(user) });
});

router.post("/auth/logout", async (req, res): Promise<void> => {
  const token = req.cookies?.[SESSION_COOKIE];
  if (token) {
    await db.delete(milmartsAuthSessionsTable).where(eq(milmartsAuthSessionsTable.tokenHash, tokenHash(token)));
  }
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" });
  res.status(204).send();
});

router.get("/auth/me", async (req, res): Promise<void> => {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    res.status(401).json({ error: "Not signed in." });
    return;
  }
  res.json({ user: publicUser(user) });
});

router.post("/auth/wallet/fund/flutterwave", async (req, res): Promise<void> => {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    res.status(401).json({ error: "Log in to fund your wallet." });
    return;
  }
  const amountNaira = Number(req.body?.amountNaira);
  if (!Number.isInteger(amountNaira) || amountNaira < 100 || amountNaira > 500000) {
    res.status(400).json({ error: "Choose a whole amount between ₦100 and ₦500,000." });
    return;
  }

  if (!getFlutterwaveSecret()) {
    res.status(503).json({ error: "Wallet funding is temporarily unavailable. Flutterwave has not been configured yet." });
    return;
  }

  const amountKobo = amountNaira * 100;
  const txRef = `milmarts_wallet_${user.id}_${Date.now()}_${crypto.randomBytes(8).toString("hex")}`;
  const origin = getRequestOrigin(req);
  if (!origin) {
    res.status(500).json({ error: "We could not determine the Milmarts return address for this payment." });
    return;
  }
  const [payment] = await db.insert(milmartsWalletFundingPaymentsTable).values({
    userId: user.id,
    txRef,
    amountKobo,
  }).returning();
  const redirectUrl = `${origin}/api/auth/wallet/fund/flutterwave/callback?embedded=1`;

  try {
    const response = await flutterwaveRequest("/payments", {
      method: "POST",
      body: JSON.stringify({
        tx_ref: txRef,
        amount: amountNaira,
        currency: "NGN",
        redirect_url: redirectUrl,
        customer: {
          email: user.email,
          name: `${user.firstName} ${user.lastName}`,
          phonenumber: user.phone,
        },
        customizations: {
          title: "Milmarts wallet funding",
          description: `Add ₦${amountNaira.toLocaleString("en-NG")} to your Milmarts wallet`,
          logo: `${origin}/milmarts-wordmark.png`,
        },
        meta: {
          user_id: String(user.id),
          wallet_payment_id: String(payment.id),
        },
      }),
    });
    const body = await response.json().catch(() => null) as { status?: string; message?: string; data?: { link?: string } } | null;
    if (!response.ok || body?.status !== "success" || !body.data?.link) {
      await db.update(milmartsWalletFundingPaymentsTable)
        .set({ status: "failed" })
        .where(eq(milmartsWalletFundingPaymentsTable.id, payment.id));
      res.status(502).json({ error: body?.message || "Flutterwave could not start this payment." });
      return;
    }

    res.json({ paymentUrl: body.data.link, txRef });
  } catch (error) {
    await db.update(milmartsWalletFundingPaymentsTable)
      .set({ status: "failed" })
      .where(eq(milmartsWalletFundingPaymentsTable.id, payment.id));
    res.status(502).json({ error: error instanceof Error ? error.message : "Flutterwave could not start this payment." });
  }
});

router.get("/auth/wallet/fund/flutterwave/callback", async (req, res): Promise<void> => {
  const status = typeof req.query.status === "string" ? req.query.status : "";
  const txRef = typeof req.query.tx_ref === "string" ? req.query.tx_ref : "";
  const transactionId = typeof req.query.transaction_id === "string" ? req.query.transaction_id : "";
  const embedded = req.query.embedded === "1";

  if (status !== "successful" || !txRef || !transactionId) {
    walletRedirect(res, req, status === "cancelled" ? "cancelled" : "failed", embedded);
    return;
  }

  try {
    const result = await verifyAndCreditWallet(txRef, transactionId);
    walletRedirect(res, req, result.ok ? "success" : "failed", embedded);
  } catch {
    walletRedirect(res, req, "failed", embedded);
  }
});

router.post("/auth/wallet/fund/flutterwave/reconcile", async (req, res): Promise<void> => {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    res.status(401).json({ error: "Log in to reconcile wallet funding." });
    return;
  }

  const requestedTxRef = typeof req.body?.txRef === "string" ? req.body.txRef.trim() : "";
  const conditions = [
    eq(milmartsWalletFundingPaymentsTable.userId, user.id),
    eq(milmartsWalletFundingPaymentsTable.status, "pending"),
  ];
  if (requestedTxRef) conditions.push(eq(milmartsWalletFundingPaymentsTable.txRef, requestedTxRef));
  else conditions.push(gt(milmartsWalletFundingPaymentsTable.createdAt, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)));

  const pendingPayments = await db.select({
    txRef: milmartsWalletFundingPaymentsTable.txRef,
  }).from(milmartsWalletFundingPaymentsTable)
    .where(and(...conditions))
    .orderBy(desc(milmartsWalletFundingPaymentsTable.createdAt))
    .limit(requestedTxRef ? 1 : 5);

  const reconciled = await Promise.all(pendingPayments.map(async (payment) => {
    try {
      const result = await verifyAndCreditWallet(payment.txRef);
      return result.ok && result.credited ? result.amountKobo : 0;
    } catch {
      return 0;
    }
  }));

  const [updatedUser] = await db.select().from(milmartsUsersTable)
    .where(eq(milmartsUsersTable.id, user.id))
    .limit(1);
  if (!updatedUser) {
    res.status(404).json({ error: "Account not found." });
    return;
  }

  res.json({
    user: publicUser(updatedUser),
    creditedAmountKobo: reconciled.reduce((total, amount) => total + amount, 0),
  });
});

router.post("/auth/wallet/fund/flutterwave/verify", async (req, res): Promise<void> => {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    res.status(401).json({ error: "Log in to verify your wallet payment." });
    return;
  }
  const txRef = typeof req.body?.txRef === "string" ? req.body.txRef : "";
  const transactionId = req.body?.transactionId == null ? "" : String(req.body.transactionId);
  if (!txRef) {
    res.status(400).json({ error: "The Flutterwave payment reference is incomplete." });
    return;
  }

  const [payment] = await db.select({ userId: milmartsWalletFundingPaymentsTable.userId })
    .from(milmartsWalletFundingPaymentsTable)
    .where(eq(milmartsWalletFundingPaymentsTable.txRef, txRef))
    .limit(1);
  if (!payment || payment.userId !== user.id) {
    res.status(403).json({ error: "That payment does not belong to this account." });
    return;
  }

  try {
    const result = await verifyAndCreditWallet(txRef, transactionId || undefined);
    if (!result.ok) {
      res.status(400).json({ error: "Flutterwave could not verify this payment. No funds were added." });
      return;
    }
    const [updatedUser] = await db.select().from(milmartsUsersTable).where(eq(milmartsUsersTable.id, user.id)).limit(1);
    res.json({
      user: publicUser(updatedUser),
      message: `₦${(result.amountKobo / 100).toLocaleString("en-NG")} added to your wallet.`,
    });
  } catch {
    res.status(502).json({ error: "Flutterwave verification is temporarily unavailable. No funds were added." });
  }
});

export default router;