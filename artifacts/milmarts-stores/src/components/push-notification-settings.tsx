import { useEffect, useState } from "react";
import { Bell, BellOff, LoaderCircle, Send } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetNotificationStatusQueryKey,
  useGetNotificationStatus,
  useRemovePushSubscription,
  useSavePushSubscription,
} from "@workspace/api-client-react";
import { Link } from "wouter";
import { useAuth } from "@/lib/auth";

function decodePublicKey(value: string) {
  const padded = value + "=".repeat((4 - (value.length % 4)) % 4);
  const decoded = atob(padded.replaceAll("-", "+").replaceAll("_", "/"));
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}

export function PushNotificationSettings() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const statusQuery = useGetNotificationStatus({
    query: {
      queryKey: getGetNotificationStatusQueryKey(),
      enabled: Boolean(user),
    },
  });
  const saveSubscription = useSavePushSubscription();
  const removeSubscription = useRemovePushSubscription();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [localEndpoint, setLocalEndpoint] = useState("");
  const supported = "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;
  const status = statusQuery.data;

  useEffect(() => {
    if (!user || !supported) return;
    let active = true;
    void navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => {
        if (active) setLocalEndpoint(subscription?.endpoint ?? "");
      })
      .catch(() => {
        if (active) setLocalEndpoint("");
      });
    return () => { active = false; };
  }, [supported, user?.id]);

  if (!user) return null;

  const refreshStatus = async () => {
    await queryClient.invalidateQueries({ queryKey: getGetNotificationStatusQueryKey() });
  };

  const enableNotifications = async () => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (!supported) throw new Error("Push notifications are not supported by this browser.");
      if (!status?.vapidPublicKey) throw new Error("Push notifications are not configured yet.");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("Allow notifications in your browser settings to turn them on.");

      await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`);
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      const subscription = existing ?? await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodePublicKey(status.vapidPublicKey),
      });
      const details = subscription.toJSON();
      if (!details.endpoint || !details.keys?.p256dh || !details.keys.auth) {
        throw new Error("This browser returned incomplete push subscription details.");
      }
      await saveSubscription.mutateAsync({
        data: {
          endpoint: details.endpoint,
          keys: { p256dh: details.keys.p256dh, auth: details.keys.auth },
        },
      });
      setLocalEndpoint(details.endpoint);
      await refreshStatus();
      setMessage("Notifications are enabled on this device.");
    } catch (subscribeError) {
      setError(subscribeError instanceof Error ? subscribeError.message : "We could not enable push notifications.");
    } finally {
      setBusy(false);
    }
  };

  const disableNotifications = async () => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const registration = await navigator.serviceWorker.ready;
      const browserSubscription = await registration.pushManager.getSubscription();
      const endpoint = browserSubscription?.endpoint ?? localEndpoint;
      if (endpoint) {
        await removeSubscription.mutateAsync({ data: { endpoint } });
      }
      if (browserSubscription) await browserSubscription.unsubscribe();
      setLocalEndpoint("");
      await refreshStatus();
      setMessage("Notifications are turned off on this device.");
    } catch (unsubscribeError) {
      setError(unsubscribeError instanceof Error ? unsubscribeError.message : "We could not turn notifications off.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="dashboard-panel push-settings-panel">
      <div className="dashboard-panel-heading">
        <div>
          <p className="market-section-kicker">Push notifications</p>
          <h2>Get Milmarts updates on this device</h2>
        </div>
        {status?.isSubscribed ? <Bell className="h-6 w-6" /> : <BellOff className="h-6 w-6" />}
      </div>
      <p className="dashboard-panel-copy">Choose whether this browser or installed Milmarts app can receive store announcements. On iPhone or iPad, add Milmarts to your Home Screen first. You can turn notifications off at any time.</p>

      {statusQuery.isLoading ? (
        <p className="push-settings-note"><LoaderCircle className="h-4 w-4 animate-spin" /> Checking this device…</p>
      ) : !supported ? (
        <p className="push-settings-note">This browser does not support web push notifications.</p>
      ) : statusQuery.isError ? (
        <p className="push-settings-feedback is-error" role="alert">We could not check your notification settings. Refresh the page and try again.</p>
      ) : !status?.vapidPublicKey ? (
        <p className="push-settings-note">Push notifications are being configured. You can enable them here once setup is complete.</p>
      ) : (
        <div className="push-settings-actions">
          <button className="dashboard-outline-button" type="button" disabled={busy} onClick={() => void (localEndpoint ? disableNotifications() : enableNotifications())}>
            {busy && <LoaderCircle className="h-4 w-4 animate-spin" />}
            {localEndpoint ? "Turn off on this device" : "Enable on this device"}
          </button>
        </div>
      )}
      {status?.canManage && <Link className="push-admin-link" href="/admin/notifications"><Send className="h-4 w-4" /> Open notification admin</Link>}
      {error && <p className="push-settings-feedback is-error" role="alert">{error}</p>}
      {message && <p className="push-settings-feedback" role="status">{message}</p>}
      {status?.isSubscribed && !localEndpoint && supported && <p className="push-settings-note">Notifications are enabled on another device; this device is not subscribed.</p>}
    </section>
  );
}
