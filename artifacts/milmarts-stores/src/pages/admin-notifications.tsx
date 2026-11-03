import { useState, type FormEvent } from "react";
import { ArrowLeft, BellRing, LoaderCircle, Send } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  getGetAdminNotificationsQueryKey,
  useGetAdminNotifications,
  useSendAdminPushNotification,
} from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function AdminNotifications() {
  const { isLoading: authLoading, user } = useAuth();
  const queryClient = useQueryClient();
  const dashboardQuery = useGetAdminNotifications({
    query: {
      queryKey: getGetAdminNotificationsQueryKey(),
      enabled: Boolean(user),
    },
  });
  const sendMutation = useSendAdminPushNotification();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [targetPath, setTargetPath] = useState("/shop");
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");

  const sendNotification = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFeedback("");
    setError("");
    const subscriberCount = dashboardQuery.data?.subscriberCount ?? 0;
    if (!subscriberCount) {
      setError("There are no opted-in devices to notify yet.");
      return;
    }
    const confirmed = window.confirm(`Send this notification to ${subscriberCount} opted-in device${subscriberCount === 1 ? "" : "s"}?`);
    if (!confirmed) return;

    try {
      const result = await sendMutation.mutateAsync({
        data: {
          title: title.trim(),
          body: body.trim(),
          targetPath: targetPath.trim(),
        },
      });
      setFeedback(`Sent to ${result.sentCount} of ${result.totalRecipients} opted-in devices${result.failedCount ? `; ${result.failedCount} could not be reached` : ""}.`);
      setTitle("");
      setBody("");
      await queryClient.invalidateQueries({ queryKey: getGetAdminNotificationsQueryKey() });
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "We could not send this notification.");
    }
  };

  if (authLoading || (user && dashboardQuery.isLoading)) {
    return (
      <div className="marketplace-page push-admin-page">
        <div className="market-container push-admin-container">
          <p className="market-section-kicker">Milmarts admin</p>
          <h1>Loading notifications…</h1>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="marketplace-page push-admin-page">
        <div className="market-container push-admin-container">
          <section className="push-admin-state-card">
            <BellRing className="h-6 w-6" />
            <h1>Sign in to open notification admin.</h1>
            <Link className="auth-submit auth-submit--compact" href="/login">Log in</Link>
          </section>
        </div>
      </div>
    );
  }

  if (dashboardQuery.isError || !dashboardQuery.data) {
    return (
      <div className="marketplace-page push-admin-page">
        <div className="market-container push-admin-container">
          <section className="push-admin-state-card">
            <BellRing className="h-6 w-6" />
            <h1>Staff access is required.</h1>
            <p>This account cannot send Milmarts notifications.</p>
            <Link className="push-admin-back-link" href="/account"><ArrowLeft className="h-4 w-4" /> Back to your account</Link>
          </section>
        </div>
      </div>
    );
  }

  const dashboard = dashboardQuery.data;

  return (
    <div className="marketplace-page push-admin-page">
      <div className="market-container push-admin-container">
        <Link className="push-admin-back-link" href="/account"><ArrowLeft className="h-4 w-4" /> Account dashboard</Link>
        <header className="push-admin-header">
          <div className="push-admin-icon"><BellRing className="h-6 w-6" /></div>
          <p className="market-section-kicker">Milmarts admin</p>
          <h1>Send a store notification.</h1>
          <p>Broadcast to customers who opted in on at least one device. Each send requires confirmation.</p>
        </header>

        <div className="push-admin-grid">
          <section className="dashboard-panel push-admin-compose">
            <div className="push-admin-panel-heading">
              <div><p className="market-section-kicker">New notification</p><h2>Compose a message</h2></div>
              <Send className="h-5 w-5" />
            </div>
            <div className="push-admin-recipient-count">
              <strong>{dashboard.subscriberCount}</strong>
              <span>opted-in device{dashboard.subscriberCount === 1 ? "" : "s"}</span>
            </div>
            {!dashboard.pushReady && <p className="push-admin-warning" role="status">Push delivery needs a VAPID key before notifications can be sent.</p>}
            <form className="push-admin-form" onSubmit={(event) => void sendNotification(event)}>
              <label>Notification title
                <input maxLength={80} required value={title} onChange={(event) => setTitle(event.target.value)} placeholder="A short update for customers" />
                <small>{title.length}/80</small>
              </label>
              <label>Message
                <textarea maxLength={250} required rows={4} value={body} onChange={(event) => setBody(event.target.value)} placeholder="Write a clear, useful message." />
                <small>{body.length}/250</small>
              </label>
              <label>In-app destination
                <input maxLength={200} required value={targetPath} onChange={(event) => setTargetPath(event.target.value)} placeholder="/shop" />
                <small>Use a Milmarts path such as /shop or /tracking.</small>
              </label>
              <div className="push-admin-preview">
                <p className="market-section-kicker">Preview</p>
                <strong>{title.trim() || "Notification title"}</strong>
                <span>{body.trim() || "Your message will appear here."}</span>
              </div>
              {error && <p className="push-admin-feedback is-error" role="alert">{error}</p>}
              {feedback && <p className="push-admin-feedback" role="status">{feedback}</p>}
              <button className="tracking-save-button" type="submit" disabled={!dashboard.pushReady || dashboard.subscriberCount === 0 || sendMutation.isPending || !title.trim() || !body.trim()}>
                {sendMutation.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Send notification
              </button>
            </form>
          </section>

          <section className="dashboard-panel push-admin-history">
            <div className="push-admin-panel-heading">
              <div><p className="market-section-kicker">Recent sends</p><h2>Notification history</h2></div>
              <BellRing className="h-5 w-5" />
            </div>
            {dashboard.messages.length ? (
              <ol>
                {dashboard.messages.map((notification) => (
                  <li key={notification.id}>
                    <div><strong>{notification.title}</strong><time dateTime={notification.createdAt}>{formatDate(notification.createdAt)}</time></div>
                    <p>{notification.body}</p>
                    <span>{notification.sentCount}/{notification.recipientCount} sent · {notification.failedCount} failed · {notification.targetPath}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="push-admin-history-empty">Sent notifications will appear here.</p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
