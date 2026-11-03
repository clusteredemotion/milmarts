import { createECDH } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { and, count, desc, eq } from "drizzle-orm";
import webPush from "web-push";
import {
  db,
  milmartsPushNotificationsTable,
  milmartsPushSubscriptionsTable,
} from "@workspace/db";
import {
  RemovePushSubscriptionBody,
  SavePushSubscriptionBody,
  SendAdminPushNotificationBody,
} from "@workspace/api-zod";
import { isMilmartsAdmin } from "../lib/milmarts-admin";
import { getAuthenticatedUser, getRequestOrigin } from "./auth";

const router = Router();
const trustedPushHosts = [
  "fcm.googleapis.com",
  "push.services.mozilla.com",
  "notify.windows.com",
  "push.apple.com",
];

function isTrustedPushEndpoint(endpoint: string) {
  try {
    const parsed = new URL(endpoint);
    return parsed.protocol === "https:"
      && trustedPushHosts.some((host) => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`));
  } catch {
    return false;
  }
}

function getVapidKeys() {
  const privateKey = process.env.MILMARTS_VAPID_PRIVATE_KEY?.trim();
  if (!privateKey) return null;
  try {
    const privateBytes = Buffer.from(privateKey, "base64url");
    if (privateBytes.length !== 32) return null;
    const ecdh = createECDH("prime256v1");
    ecdh.setPrivateKey(privateBytes);
    return {
      privateKey,
      publicKey: ecdh.getPublicKey(undefined, "uncompressed").toString("base64url"),
    };
  } catch {
    return null;
  }
}

async function getUserNotificationStatus(userId: number) {
  const [subscription] = await db.select({
    id: milmartsPushSubscriptionsTable.id,
    endpoint: milmartsPushSubscriptionsTable.endpoint,
  })
    .from(milmartsPushSubscriptionsTable)
    .where(eq(milmartsPushSubscriptionsTable.userId, userId))
    .limit(1);
  return {
    isSubscribed: Boolean(subscription),
    endpoint: subscription?.endpoint ?? null,
    canManage: await isMilmartsAdmin(userId),
    vapidPublicKey: getVapidKeys()?.publicKey ?? null,
  };
}

async function requireAdmin(req: Request, res: Response) {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    res.status(401).json({ error: "Log in to manage Milmarts notifications." });
    return null;
  }
  if (!(await isMilmartsAdmin(user.id))) {
    res.status(403).json({ error: "Milmarts staff access is required to manage notifications." });
    return null;
  }
  return user;
}

function normalizeTargetPath(value: string) {
  const path = value.trim();
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\") || /[\r\n]/.test(path)) return null;
  try {
    const parsed = new URL(path, "https://milmarts.invalid");
    if (parsed.origin !== "https://milmarts.invalid") return null;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}

router.get("/notifications/status", async (req, res): Promise<void> => {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    res.status(401).json({ error: "Log in to manage your push notification settings." });
    return;
  }
  res.json(await getUserNotificationStatus(user.id));
});

router.post("/notifications/subscription", async (req, res): Promise<void> => {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    res.status(401).json({ error: "Log in to enable push notifications." });
    return;
  }
  if (!getVapidKeys()) {
    res.status(503).json({ error: "Push notifications are not configured yet." });
    return;
  }
  const parsed = SavePushSubscriptionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "This browser did not provide a valid push subscription." });
    return;
  }
  const endpoint = parsed.data.endpoint.trim();
  if (!isTrustedPushEndpoint(endpoint)) {
    res.status(400).json({ error: "This browser provided an unsupported push service endpoint." });
    return;
  }
  await db.insert(milmartsPushSubscriptionsTable)
    .values({
      userId: user.id,
      endpoint,
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: milmartsPushSubscriptionsTable.endpoint,
      set: {
        userId: user.id,
        p256dh: parsed.data.keys.p256dh,
        auth: parsed.data.keys.auth,
        updatedAt: new Date(),
      },
    });
  res.json(await getUserNotificationStatus(user.id));
});

router.delete("/notifications/subscription", async (req, res): Promise<void> => {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    res.status(401).json({ error: "Log in to manage your push notification settings." });
    return;
  }
  const parsed = RemovePushSubscriptionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "This browser did not provide a valid push subscription." });
    return;
  }
  await db.delete(milmartsPushSubscriptionsTable)
    .where(and(
      eq(milmartsPushSubscriptionsTable.userId, user.id),
      eq(milmartsPushSubscriptionsTable.endpoint, parsed.data.endpoint),
    ));
  res.json(await getUserNotificationStatus(user.id));
});

router.get("/notifications/admin", async (req, res): Promise<void> => {
  const user = await requireAdmin(req, res);
  if (!user) return;
  const [[subscriberSummary], messages] = await Promise.all([
    db.select({ total: count() }).from(milmartsPushSubscriptionsTable),
    db.select().from(milmartsPushNotificationsTable)
      .orderBy(desc(milmartsPushNotificationsTable.createdAt))
      .limit(25),
  ]);
  res.json({
    subscriberCount: subscriberSummary?.total ?? 0,
    pushReady: Boolean(getVapidKeys()),
    messages: messages.map((message) => ({
      id: message.id,
      title: message.title,
      body: message.body,
      targetPath: message.targetPath,
      recipientCount: message.recipientCount,
      sentCount: message.sentCount,
      failedCount: message.failedCount,
      createdAt: message.createdAt,
    })),
  });
});

router.post("/notifications/admin/send", async (req, res): Promise<void> => {
  const user = await requireAdmin(req, res);
  if (!user) return;
  const vapidKeys = getVapidKeys();
  if (!vapidKeys) {
    res.status(503).json({ error: "Push notifications are not configured yet." });
    return;
  }
  const parsed = SendAdminPushNotificationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter a notification title, message, and in-app destination." });
    return;
  }
  const title = parsed.data.title.trim();
  const body = parsed.data.body.trim();
  const targetPath = normalizeTargetPath(parsed.data.targetPath);
  if (!title || !body || !targetPath) {
    res.status(400).json({ error: "Use a title, message, and a link within the Milmarts site." });
    return;
  }

  const subscriptions = await db.select().from(milmartsPushSubscriptionsTable);
  const [notification] = await db.insert(milmartsPushNotificationsTable)
    .values({
      title,
      body,
      targetPath,
      recipientCount: subscriptions.length,
      createdByUserId: user.id,
    })
    .returning({ id: milmartsPushNotificationsTable.id });

  webPush.setVapidDetails(getRequestOrigin(req), vapidKeys.publicKey, vapidKeys.privateKey);
  let sentCount = 0;
  let failedCount = 0;
  const payload = JSON.stringify({ title, body, url: targetPath });

  for (let index = 0; index < subscriptions.length; index += 40) {
    const batch = subscriptions.slice(index, index + 40);
    const results = await Promise.all(batch.map(async (subscription) => {
      try {
        await webPush.sendNotification({
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        }, payload, { TTL: 60 * 60 });
        return { id: subscription.id, sent: true };
      } catch (error) {
        const statusCode = typeof error === "object" && error && "statusCode" in error
          ? Number(error.statusCode)
          : 0;
        if (statusCode === 404 || statusCode === 410) {
          try {
            await db.delete(milmartsPushSubscriptionsTable)
              .where(eq(milmartsPushSubscriptionsTable.id, subscription.id));
          } catch (deleteError) {
            req.log.warn({ err: deleteError, subscriptionId: subscription.id }, "Could not remove expired push subscription");
          }
        } else {
          req.log.warn({ err: error, subscriptionId: subscription.id }, "Push notification delivery failed");
        }
        return { id: subscription.id, sent: false };
      }
    }));
    sentCount += results.filter((result) => result.sent).length;
    failedCount += results.filter((result) => !result.sent).length;
  }

  await db.update(milmartsPushNotificationsTable)
    .set({ sentCount, failedCount })
    .where(eq(milmartsPushNotificationsTable.id, notification.id));
  res.json({ totalRecipients: subscriptions.length, sentCount, failedCount });
});

export default router;
