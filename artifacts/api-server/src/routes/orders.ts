import crypto from "node:crypto";
import { Router, type Request, type Response } from "express";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import {
  db,
  milmartsOrderItemsTable,
  milmartsOrdersTable,
  milmartsOrderTrackingEventsTable,
  milmartsProductsTable,
  milmartsUsersTable,
  milmartsWalletTransactionsTable,
} from "@workspace/db";
import {
  PayForOrderWithWalletBody,
  StartFlutterwaveOrderPaymentBody,
  UpdateLocalOrderTrackingBody,
} from "@workspace/api-zod";
import { convertToNaira, getNairaExchangeRateSnapshot, type NairaExchangeRateSnapshot } from "../lib/naira-conversion";
import { productIdFromVariantId } from "../lib/local-catalog";
import { isMilmartsAdmin } from "../lib/milmarts-admin";
import { flutterwaveRequest, getAuthenticatedUser, getRequestOrigin } from "./auth";

const router = Router();

type OrderItemSnapshot = {
  merchandiseId: string;
  title: string;
  quantity: number;
  unitPriceKobo: number;
  lineTotalKobo: number;
};
type OrderSnapshot = { subtotalKobo: number; items: OrderItemSnapshot[] };

class OrderCheckoutError extends Error {
  constructor(message: string, readonly statusCode: number) {
    super(message);
  }
}

function newOrderNumber() {
  return `MM-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}

function isUniqueViolation(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

async function createOrderSnapshot(
  req: Request,
  lines: Array<{ merchandiseId: string; quantity: number }>,
): Promise<OrderSnapshot> {
  if (!lines.length || lines.length > 50) {
    throw new OrderCheckoutError("Your cart is empty or has too many different products.", 400);
  }
  const productIds = lines.map((line) => productIdFromVariantId(line.merchandiseId));
  if (productIds.some((id) => id === null)) {
    throw new OrderCheckoutError("A product in your cart is no longer valid. Refresh your cart.", 409);
  }
  const uniqueProductIds = [...new Set(productIds as number[])];
  const products = await db.select()
    .from(milmartsProductsTable)
    .where(and(
      inArray(milmartsProductsTable.id, uniqueProductIds),
      eq(milmartsProductsTable.isPublished, true),
    ));
  if (products.length !== uniqueProductIds.length) {
    throw new OrderCheckoutError("A product in your cart is no longer available. Refresh your cart.", 409);
  }
  const productsById = new Map(products.map((product) => [product.id, product]));
  const variants = lines.map((line) => {
    if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 99) {
      throw new OrderCheckoutError("A product in your cart has an invalid quantity.", 400);
    }
    const productId = productIdFromVariantId(line.merchandiseId);
    const product = productId ? productsById.get(productId) : undefined;
    const variant = product?.variants.find((item) => item.id === line.merchandiseId);
    if (!product || !variant || !variant.availableForSale) {
      throw new OrderCheckoutError("A product in your cart is no longer available. Refresh your cart.", 409);
    }
    return { product, variant, quantity: line.quantity };
  });
  if (variants.reduce((total, line) => total + line.quantity, 0) > 250) {
    throw new OrderCheckoutError("Your cart has too many items to check out.", 400);
  }

  const needsRates = variants.some(
    ({ variant }) => variant.price.currencyCode.toUpperCase() !== "NGN",
  );
  let rateSnapshot: NairaExchangeRateSnapshot | null = null;
  if (needsRates) {
    try {
      rateSnapshot = await getNairaExchangeRateSnapshot();
    } catch (error) {
      req.log.error({ err: error }, "Could not convert order prices to Naira");
      throw new OrderCheckoutError("The Naira payment total is temporarily unavailable. Please try again.", 502);
    }
  }

  const moneyToKobo = (money: { amount: string; currencyCode: string }) => {
    const naira = convertToNaira(money, rateSnapshot);
    const amount = naira ? Number(naira.amount) : Number.NaN;
    const kobo = Math.round(amount * 100);
    if (!Number.isSafeInteger(kobo) || kobo < 0) {
      throw new OrderCheckoutError("We could not calculate a reliable Naira total. Please try again.", 502);
    }
    return kobo;
  };

  const items = variants.map(({ product, variant, quantity }) => {
    const unitPriceKobo = moneyToKobo(variant.price);
    const lineTotalKobo = unitPriceKobo * quantity;
    const variantTitle = variant.title;
    const title = variantTitle && variantTitle !== "Default Title"
      ? `${product.title} · ${variantTitle}`
      : product.title;
    return {
      merchandiseId: variant.id,
      title,
      quantity,
      unitPriceKobo,
      lineTotalKobo,
    };
  });

  const subtotalKobo = items.reduce((total, item) => total + item.lineTotalKobo, 0);
  if (subtotalKobo < 1) {
    throw new OrderCheckoutError("The product subtotal must be greater than zero.", 400);
  }
  if (!Number.isSafeInteger(subtotalKobo)) {
    throw new OrderCheckoutError("The product subtotal is too large to process.", 400);
  }

  return { subtotalKobo, items };
}

function orderView(
  order: typeof milmartsOrdersTable.$inferSelect,
  items: OrderItemSnapshot[] | typeof milmartsOrderItemsTable.$inferSelect[],
  trackingEvents: typeof milmartsOrderTrackingEventsTable.$inferSelect[] = [],
) {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    currencyCode: order.currencyCode,
    subtotalKobo: order.subtotalKobo,
    deliveryFeeKobo: order.deliveryFeeKobo,
    totalKobo: order.totalKobo,
    deliveryPricingPending: order.deliveryPricingPending,
    fulfillmentStatus: order.fulfillmentStatus,
    trackingCarrier: order.trackingCarrier,
    trackingNumber: order.trackingNumber,
    trackingUrl: order.trackingUrl,
    trackingEvents: trackingEvents.map((event) => ({
      id: event.id,
      status: event.status,
      message: event.message,
      location: event.location,
      createdAt: event.createdAt,
    })),
    shippingFullName: order.shippingFullName,
    shippingPhone: order.shippingPhone,
    shippingAddress1: order.shippingAddress1,
    shippingAddress2: order.shippingAddress2,
    shippingCity: order.shippingCity,
    shippingRegion: order.shippingRegion,
    shippingPostalCode: order.shippingPostalCode,
    shippingCountry: order.shippingCountry,
    createdAt: order.createdAt,
    paidAt: order.paidAt,
    items: items.map((item) => ({
      merchandiseId: item.merchandiseId,
      title: item.title,
      quantity: item.quantity,
      unitPriceKobo: item.unitPriceKobo,
      lineTotalKobo: item.lineTotalKobo,
    })),
  };
}

async function getOrderViews(orders: typeof milmartsOrdersTable.$inferSelect[]) {
  if (!orders.length) return [];
  const orderIds = orders.map((order) => order.id);
  const [items, trackingEvents] = await Promise.all([
    db.select().from(milmartsOrderItemsTable).where(inArray(milmartsOrderItemsTable.orderId, orderIds)),
    db.select().from(milmartsOrderTrackingEventsTable).where(inArray(milmartsOrderTrackingEventsTable.orderId, orderIds)),
  ]);
  const itemsByOrder = new Map<number, typeof items>();
  for (const item of items) {
    const list = itemsByOrder.get(item.orderId) ?? [];
    list.push(item);
    itemsByOrder.set(item.orderId, list);
  }
  const eventsByOrder = new Map<number, typeof trackingEvents>();
  for (const event of trackingEvents) {
    const list = eventsByOrder.get(event.orderId) ?? [];
    list.push(event);
    eventsByOrder.set(event.orderId, list);
  }
  for (const events of eventsByOrder.values()) {
    events.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }
  return orders.map((order) => orderView(
    order,
    itemsByOrder.get(order.id) ?? [],
    eventsByOrder.get(order.id) ?? [],
  ));
}

async function getOrderViewForUser(userId: number, orderNumber: string) {
  const [order] = await db.select()
    .from(milmartsOrdersTable)
    .where(and(
      eq(milmartsOrdersTable.userId, userId),
      eq(milmartsOrdersTable.orderNumber, orderNumber),
    ))
    .limit(1);
  if (!order) return null;
  const [view] = await getOrderViews([order]);
  return view ?? null;
}

async function getOrderViewByNumber(orderNumber: string) {
  const [order] = await db.select()
    .from(milmartsOrdersTable)
    .where(eq(milmartsOrdersTable.orderNumber, orderNumber))
    .limit(1);
  if (!order) return null;
  const [view] = await getOrderViews([order]);
  return view ?? null;
}

async function findOrderByIdempotencyKey(userId: number, idempotencyKey: string) {
  const [order] = await db.select()
    .from(milmartsOrdersTable)
    .where(and(
      eq(milmartsOrdersTable.userId, userId),
      eq(milmartsOrdersTable.idempotencyKey, idempotencyKey),
    ))
    .limit(1);
  return order ?? null;
}

async function sendOrderCallbackPage(
  res: Response,
  req: Request,
  status: "success" | "cancelled" | "failed",
  orderNumber: string,
) {
  const origin = getRequestOrigin(req);
  if (!origin) {
    res.status(500).send("Payment completed, but Milmarts could not confirm the result.");
    return;
  }
  const messageStatus = JSON.stringify(status);
  const messageOrderNumber = JSON.stringify(orderNumber);
  const targetOrigin = JSON.stringify(origin);
  res.type("html").send(`<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Milmarts payment</title></head>
  <body style="margin:0;display:grid;min-height:100vh;place-items:center;background:#fff8f6;color:#282326;font:16px system-ui,sans-serif">
    <main style="max-width:28rem;padding:2rem;text-align:center">
      <strong style="color:#be1e3e">Milmarts</strong>
      <h1 style="font:700 1.8rem Georgia,serif">Payment ${status === "success" ? "confirmed" : status === "cancelled" ? "cancelled" : "could not be verified"}</h1>
      <p>You can close this payment window and continue your order on Milmarts.</p>
    </main>
    <script>
      window.parent.postMessage({ type: "milmarts-order-payment", status: ${messageStatus}, orderNumber: ${messageOrderNumber} }, ${targetOrigin});
    </script>
  </body>
</html>`);
}

async function verifyAndCompleteOrder(orderNumber: string, transactionId?: string) {
  const [order] = await db.select()
    .from(milmartsOrdersTable)
    .where(eq(milmartsOrdersTable.orderNumber, orderNumber))
    .limit(1);
  if (!order || order.paymentMethod !== "card" || !order.flutterwaveTxRef) return false;
  if (order.paymentStatus === "paid") return true;
  if (order.paymentStatus !== "pending") return false;

  const verifyPath = transactionId
    ? `/transactions/${encodeURIComponent(transactionId)}/verify`
    : `/transactions/verify_by_reference?tx_ref=${encodeURIComponent(order.flutterwaveTxRef)}`;
  const response = await flutterwaveRequest(verifyPath, { method: "GET" });
  const body = await response.json().catch(() => null) as {
    status?: string;
    data?: {
      id?: number | string;
      status?: string;
      amount?: number | string;
      currency?: string;
      tx_ref?: string;
    };
  } | null;
  if (!response.ok || body?.status !== "success" || !body.data) return false;
  const transaction = body.data;
  const matchingTransaction = transaction.tx_ref === order.flutterwaveTxRef
    && transaction.currency === "NGN"
    && Number.isFinite(Number(transaction.amount))
    && Math.round(Number(transaction.amount) * 100) === order.totalKobo;
  if (!matchingTransaction) return false;
  if (transaction.status === "failed" || transaction.status === "cancelled") {
    await db.update(milmartsOrdersTable)
      .set({
        paymentStatus: "failed",
        status: transaction.status === "cancelled" ? "payment_cancelled" : "payment_failed",
      })
      .where(and(
        eq(milmartsOrdersTable.id, order.id),
        eq(milmartsOrdersTable.paymentStatus, "pending"),
      ));
    return false;
  }
  if (
    transaction.status !== "successful" ||
    transaction.id === undefined ||
    (transactionId && String(transaction.id) !== transactionId)
  ) {
    return false;
  }

  const [claimedOrder] = await db.update(milmartsOrdersTable)
    .set({
      paymentStatus: "paid",
      status: "processing",
      flutterwaveTransactionId: String(transaction.id),
      paidAt: new Date(),
    })
    .where(and(
      eq(milmartsOrdersTable.id, order.id),
      eq(milmartsOrdersTable.paymentStatus, "pending"),
    ))
    .returning({ id: milmartsOrdersTable.id });
  if (claimedOrder) return true;

  const [currentOrder] = await db.select({ paymentStatus: milmartsOrdersTable.paymentStatus })
    .from(milmartsOrdersTable)
    .where(eq(milmartsOrdersTable.id, order.id))
    .limit(1);
  return currentOrder?.paymentStatus === "paid";
}

router.get("/orders", async (req, res): Promise<void> => {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    res.status(401).json({ error: "Log in to view your orders." });
    return;
  }
  const orders = await db.select()
    .from(milmartsOrdersTable)
    .where(eq(milmartsOrdersTable.userId, user.id))
    .orderBy(desc(milmartsOrdersTable.createdAt))
    .limit(50);
  res.json({ orders: await getOrderViews(orders) });
});

router.get("/orders/tracking", async (req, res): Promise<void> => {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    res.status(401).json({ error: "Log in to track your Milmarts orders." });
    return;
  }
  const canManage = await isMilmartsAdmin(user.id);
  const orderFilter = canManage
    ? eq(milmartsOrdersTable.paymentStatus, "paid")
    : and(
      eq(milmartsOrdersTable.userId, user.id),
      eq(milmartsOrdersTable.paymentStatus, "paid"),
    );
  const orders = await db.select()
    .from(milmartsOrdersTable)
    .where(orderFilter)
    .orderBy(desc(milmartsOrdersTable.createdAt))
    .limit(canManage ? 100 : 50);
  res.json({ orders: await getOrderViews(orders), canManage });
});

router.patch("/orders/:orderNumber/tracking", async (req, res): Promise<void> => {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    res.status(401).json({ error: "Log in to update order tracking." });
    return;
  }
  if (!(await isMilmartsAdmin(user.id))) {
    res.status(403).json({ error: "Tracking staff access is required to make order updates." });
    return;
  }
  const parsed = UpdateLocalOrderTrackingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter a valid fulfillment status and tracking information." });
    return;
  }
  const input = parsed.data;
  const orderNumber = typeof req.params.orderNumber === "string" ? req.params.orderNumber : "";
  const [order] = await db.select()
    .from(milmartsOrdersTable)
    .where(eq(milmartsOrdersTable.orderNumber, orderNumber))
    .limit(1);
  if (!order || order.paymentStatus !== "paid") {
    res.status(order ? 409 : 404).json({
      error: order ? "Only paid orders can receive tracking updates." : "Paid order not found.",
    });
    return;
  }

  const trackingCarrier = input.trackingCarrier?.trim() || null;
  const trackingNumber = input.trackingNumber?.trim() || null;
  const trackingUrl = input.trackingUrl?.trim() || null;
  if (trackingUrl) {
    try {
      if (new URL(trackingUrl).protocol !== "https:") throw new Error("Tracking links must use HTTPS.");
    } catch {
      res.status(400).json({ error: "Enter a valid secure tracking link that starts with https://." });
      return;
    }
  }
  if (input.fulfillmentStatus === "shipped" && !trackingNumber && !trackingUrl) {
    res.status(400).json({ error: "Add a tracking number or tracking link before marking the order shipped." });
    return;
  }

  const defaultMessages: Record<string, string> = {
    processing: "Your order is being prepared.",
    packed: "Your order has been packed.",
    shipped: "Your order has been handed to the carrier.",
    delivered: "Your order has been delivered.",
  };
  const message = input.message?.trim() || defaultMessages[input.fulfillmentStatus];
  const location = input.location?.trim() || null;
  try {
    await db.transaction(async (tx) => {
      await tx.update(milmartsOrdersTable)
        .set({
          fulfillmentStatus: input.fulfillmentStatus,
          trackingCarrier,
          trackingNumber,
          trackingUrl,
        })
        .where(eq(milmartsOrdersTable.id, order.id));
      await tx.insert(milmartsOrderTrackingEventsTable).values({
        orderId: order.id,
        status: input.fulfillmentStatus,
        message,
        location,
        createdByUserId: user.id,
      });
    });
  } catch (error) {
    req.log.error({ err: error, orderNumber }, "Failed to update Milmarts order tracking");
    res.status(500).json({ error: "We could not save the tracking update. Please try again." });
    return;
  }
  const updatedOrder = await getOrderViewByNumber(orderNumber);
  if (!updatedOrder) {
    res.status(404).json({ error: "The order could not be found after updating tracking." });
    return;
  }
  res.json(updatedOrder);
});

router.post("/orders/wallet", async (req, res): Promise<void> => {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    res.status(401).json({ error: "Log in to pay from your Milmarts wallet." });
    return;
  }
  const parsed = PayForOrderWithWalletBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter valid delivery and cart details before paying." });
    return;
  }

  const input = parsed.data;
  const priorOrder = await findOrderByIdempotencyKey(user.id, input.idempotencyKey);
  if (priorOrder) {
    if (priorOrder.paymentMethod === "wallet" && priorOrder.paymentStatus === "paid") {
      const existingView = await getOrderViewForUser(user.id, priorOrder.orderNumber);
      if (existingView) {
        res.status(200).json(existingView);
        return;
      }
    }
    res.status(409).json({ error: "This checkout was already started. Refresh the page before trying again." });
    return;
  }

  let snapshot: OrderSnapshot;
  try {
    snapshot = await createOrderSnapshot(req, input.lines);
  } catch (error) {
    const statusCode = error instanceof OrderCheckoutError ? error.statusCode : 502;
    const message = error instanceof OrderCheckoutError ? error.message : "We could not verify your cart.";
    res.status(statusCode).json({ error: message });
    return;
  }

  const orderNumber = newOrderNumber();
  try {
    const result = await db.transaction(async (tx) => {
      const [existing] = await tx.select()
        .from(milmartsOrdersTable)
        .where(and(
          eq(milmartsOrdersTable.userId, user.id),
          eq(milmartsOrdersTable.idempotencyKey, input.idempotencyKey),
        ))
        .limit(1);
      if (existing) return { kind: "existing" as const, order: existing };

      const [updatedUser] = await tx.update(milmartsUsersTable)
        .set({ walletBalanceKobo: sql`${milmartsUsersTable.walletBalanceKobo} - ${snapshot.subtotalKobo}` })
        .where(and(
          eq(milmartsUsersTable.id, user.id),
          gte(milmartsUsersTable.walletBalanceKobo, snapshot.subtotalKobo),
        ))
        .returning({ id: milmartsUsersTable.id });
      if (!updatedUser) return { kind: "insufficient" as const };

      const [order] = await tx.insert(milmartsOrdersTable).values({
        orderNumber,
        userId: user.id,
        idempotencyKey: input.idempotencyKey,
        status: "processing",
        paymentMethod: "wallet",
        paymentStatus: "paid",
        currencyCode: "NGN",
        subtotalKobo: snapshot.subtotalKobo,
        deliveryFeeKobo: 0,
        totalKobo: snapshot.subtotalKobo,
        deliveryPricingPending: true,
        shippingFullName: input.shippingFullName,
        shippingPhone: input.shippingPhone,
        shippingAddress1: input.shippingAddress1,
        shippingAddress2: input.shippingAddress2 || null,
        shippingCity: input.shippingCity,
        shippingRegion: input.shippingRegion,
        shippingPostalCode: input.shippingPostalCode || null,
        shippingCountry: input.shippingCountry,
        paidAt: new Date(),
      }).returning();

      await tx.insert(milmartsOrderItemsTable).values(
        snapshot.items.map((item) => ({ ...item, orderId: order.id })),
      );
      await tx.insert(milmartsWalletTransactionsTable).values({
        userId: user.id,
        amountKobo: -snapshot.subtotalKobo,
        type: "order_payment",
        reference: order.orderNumber,
      });
      return { kind: "created" as const, order };
    });

    if (result.kind === "insufficient") {
      res.status(409).json({ error: "Your Milmarts wallet balance is not enough for this order. Fund your wallet or choose card." });
      return;
    }
    if (result.kind === "existing") {
      if (result.order.paymentMethod === "wallet" && result.order.paymentStatus === "paid") {
        const existingView = await getOrderViewForUser(user.id, result.order.orderNumber);
        if (existingView) {
          res.status(200).json(existingView);
          return;
        }
      }
      res.status(409).json({ error: "This checkout was already started. Refresh the page before trying again." });
      return;
    }
    const orderViewResult = await getOrderViewForUser(user.id, result.order.orderNumber);
    res.status(201).json(orderViewResult);
  } catch (error) {
    if (isUniqueViolation(error)) {
      const existing = await findOrderByIdempotencyKey(user.id, input.idempotencyKey);
      if (existing?.paymentMethod === "wallet" && existing.paymentStatus === "paid") {
        const existingView = await getOrderViewForUser(user.id, existing.orderNumber);
        if (existingView) {
          res.status(200).json(existingView);
          return;
        }
      }
    }
    req.log.error({ err: error, userId: user.id }, "Failed to create wallet-paid Milmarts order");
    res.status(500).json({ error: "We could not complete this order. Your wallet was not charged." });
  }
});

router.post("/orders/flutterwave", async (req, res): Promise<void> => {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    res.status(401).json({ error: "Log in to pay by card." });
    return;
  }
  const parsed = StartFlutterwaveOrderPaymentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter valid delivery and cart details before paying." });
    return;
  }

  const input = parsed.data;
  let order = await findOrderByIdempotencyKey(user.id, input.idempotencyKey);
  if (order) {
    if (
      order.paymentMethod === "card" &&
      order.paymentStatus === "pending" &&
      order.flutterwavePaymentUrl &&
      order.flutterwaveTxRef
    ) {
      res.status(200).json({
        orderNumber: order.orderNumber,
        txRef: order.flutterwaveTxRef,
        paymentUrl: order.flutterwavePaymentUrl,
        totalKobo: order.totalKobo,
      });
      return;
    }
    res.status(409).json({ error: "This checkout was already used. Start a new checkout to try again." });
    return;
  }

  let snapshot: OrderSnapshot;
  try {
    snapshot = await createOrderSnapshot(req, input.lines);
  } catch (error) {
    const statusCode = error instanceof OrderCheckoutError ? error.statusCode : 502;
    const message = error instanceof OrderCheckoutError ? error.message : "We could not verify your cart.";
    res.status(statusCode).json({ error: message });
    return;
  }

  const origin = getRequestOrigin(req);
  if (!origin) {
    res.status(500).json({ error: "We could not start secure payment from this page." });
    return;
  }
  const orderNumber = newOrderNumber();
  const txRef = `milmarts_order_${user.id}_${crypto.randomBytes(16).toString("hex")}`;
  try {
    const [newOrder] = await db.insert(milmartsOrdersTable).values({
      orderNumber,
      userId: user.id,
      idempotencyKey: input.idempotencyKey,
      status: "awaiting_payment",
      paymentMethod: "card",
      paymentStatus: "pending",
      currencyCode: "NGN",
      subtotalKobo: snapshot.subtotalKobo,
      deliveryFeeKobo: 0,
      totalKobo: snapshot.subtotalKobo,
      deliveryPricingPending: true,
      shippingFullName: input.shippingFullName,
      shippingPhone: input.shippingPhone,
      shippingAddress1: input.shippingAddress1,
      shippingAddress2: input.shippingAddress2 || null,
      shippingCity: input.shippingCity,
      shippingRegion: input.shippingRegion,
      shippingPostalCode: input.shippingPostalCode || null,
      shippingCountry: input.shippingCountry,
      flutterwaveTxRef: txRef,
    }).returning();
    order = newOrder;
    await db.insert(milmartsOrderItemsTable).values(
      snapshot.items.map((item) => ({ ...item, orderId: newOrder.id })),
    );

    const paymentResponse = await flutterwaveRequest("/payments", {
      method: "POST",
      body: JSON.stringify({
        tx_ref: txRef,
        amount: (snapshot.subtotalKobo / 100).toFixed(2),
        currency: "NGN",
        redirect_url: `${origin}/api/orders/flutterwave/callback?embedded=1`,
        customer: {
          email: user.email,
          name: `${user.firstName} ${user.lastName}`,
          phonenumber: input.shippingPhone,
        },
        customizations: {
          title: "Milmarts order",
          description: `Order ${orderNumber} · products only`,
          logo: `${origin}/milmarts-wordmark.png`,
        },
        meta: {
          user_id: String(user.id),
          order_number: orderNumber,
        },
      }),
    });
    const paymentBody = await paymentResponse.json().catch(() => null) as {
      status?: string;
      message?: string;
      data?: { link?: string };
    } | null;
    if (!paymentResponse.ok || paymentBody?.status !== "success" || !paymentBody.data?.link) {
      await db.update(milmartsOrdersTable)
        .set({ paymentStatus: "failed", status: "payment_failed" })
        .where(eq(milmartsOrdersTable.id, newOrder.id));
      req.log.error({ status: paymentResponse.status, orderNumber }, "Flutterwave rejected Milmarts order payment");
      res.status(502).json({ error: paymentBody?.message || "Flutterwave could not start this card payment." });
      return;
    }

    await db.update(milmartsOrdersTable)
      .set({ flutterwavePaymentUrl: paymentBody.data.link })
      .where(eq(milmartsOrdersTable.id, newOrder.id));
    res.status(201).json({
      orderNumber,
      txRef,
      paymentUrl: paymentBody.data.link,
      totalKobo: snapshot.subtotalKobo,
    });
  } catch (error) {
    if (order) {
      await db.update(milmartsOrdersTable)
        .set({ paymentStatus: "failed", status: "payment_failed" })
        .where(eq(milmartsOrdersTable.id, order.id));
    }
    if (isUniqueViolation(error)) {
      const existing = await findOrderByIdempotencyKey(user.id, input.idempotencyKey);
      if (
        existing?.paymentMethod === "card" &&
        existing.paymentStatus === "pending" &&
        existing.flutterwavePaymentUrl &&
        existing.flutterwaveTxRef
      ) {
        res.status(200).json({
          orderNumber: existing.orderNumber,
          txRef: existing.flutterwaveTxRef,
          paymentUrl: existing.flutterwavePaymentUrl,
          totalKobo: existing.totalKobo,
        });
        return;
      }
      res.status(409).json({ error: "This checkout was already started. Refresh and try again." });
      return;
    }
    req.log.error({ err: error, userId: user.id }, "Failed to start Flutterwave payment for Milmarts order");
    res.status(502).json({ error: "Flutterwave could not start this card payment." });
  }
});

router.get("/orders/flutterwave/callback", async (req, res): Promise<void> => {
  const status = typeof req.query.status === "string" ? req.query.status : "";
  const txRef = typeof req.query.tx_ref === "string" ? req.query.tx_ref : "";
  const transactionId = typeof req.query.transaction_id === "string" ? req.query.transaction_id : "";
  const embedded = req.query.embedded === "1";
  const [order] = txRef
    ? await db.select({ orderNumber: milmartsOrdersTable.orderNumber })
      .from(milmartsOrdersTable)
      .where(eq(milmartsOrdersTable.flutterwaveTxRef, txRef))
      .limit(1)
    : [];
  const orderNumber = order?.orderNumber ?? "";

  if (!embedded) {
    res.redirect(orderNumber ? `${getRequestOrigin(req)}/orders` : `${getRequestOrigin(req)}/cart`);
    return;
  }
  if (!orderNumber || !transactionId || status !== "successful") {
    if (orderNumber && status === "cancelled") {
      await db.update(milmartsOrdersTable)
        .set({ status: "payment_cancelled", paymentStatus: "failed" })
        .where(and(
          eq(milmartsOrdersTable.orderNumber, orderNumber),
          eq(milmartsOrdersTable.paymentStatus, "pending"),
        ));
    }
    await sendOrderCallbackPage(res, req, status === "cancelled" ? "cancelled" : "failed", orderNumber);
    return;
  }

  try {
    const verified = await verifyAndCompleteOrder(orderNumber, transactionId);
    await sendOrderCallbackPage(res, req, verified ? "success" : "failed", orderNumber);
  } catch (error) {
    req.log.error({ err: error, orderNumber }, "Could not verify Flutterwave order payment");
    await sendOrderCallbackPage(res, req, "failed", orderNumber);
  }
});

router.post("/orders/:orderNumber/reconcile", async (req, res): Promise<void> => {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    res.status(401).json({ error: "Log in to confirm your order payment." });
    return;
  }
  const orderNumber = typeof req.params.orderNumber === "string" ? req.params.orderNumber : "";
  const order = await getOrderViewForUser(user.id, orderNumber);
  if (!order) {
    res.status(404).json({ error: "We could not find that Milmarts order." });
    return;
  }

  if (order.paymentStatus === "pending") {
    try {
      await verifyAndCompleteOrder(orderNumber);
    } catch (error) {
      req.log.error({ err: error, orderNumber }, "Could not reconcile Flutterwave order payment");
    }
  }
  const updatedOrder = await getOrderViewForUser(user.id, orderNumber);
  res.json(updatedOrder ?? order);
});

export default router;
