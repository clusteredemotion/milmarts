import { useState, type FormEvent } from "react";
import { ArrowRight, Check, ClipboardList, LoaderCircle, MapPin, Package, Truck } from "lucide-react";
import { Link } from "wouter";
import {
  getListTrackingOrdersQueryKey,
  useListTrackingOrders,
  useUpdateLocalOrderTracking,
  type LocalOrder,
  type UpdateLocalOrderTrackingInput,
} from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";

const FULFILLMENT_STEPS: Array<{ key: UpdateLocalOrderTrackingInput["fulfillmentStatus"]; label: string }> = [
  { key: "processing", label: "Preparing" },
  { key: "packed", label: "Packed" },
  { key: "shipped", label: "On the way" },
  { key: "delivered", label: "Delivered" },
];

const STATUS_LABELS: Record<UpdateLocalOrderTrackingInput["fulfillmentStatus"], string> = {
  processing: "Preparing",
  packed: "Packed",
  shipped: "On the way",
  delivered: "Delivered",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function TrackingEditor({ order, onSaved }: { order: LocalOrder; onSaved: () => void }) {
  const updateMutation = useUpdateLocalOrderTracking();
  const [status, setStatus] = useState<UpdateLocalOrderTrackingInput["fulfillmentStatus"]>(order.fulfillmentStatus);
  const [carrier, setCarrier] = useState(order.trackingCarrier ?? "");
  const [trackingNumber, setTrackingNumber] = useState(order.trackingNumber ?? "");
  const [trackingUrl, setTrackingUrl] = useState(order.trackingUrl ?? "");
  const [message, setMessage] = useState("");
  const [location, setLocation] = useState("");
  const [savedMessage, setSavedMessage] = useState("");
  const [error, setError] = useState("");

  const submitUpdate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSavedMessage("");
    if (!window.confirm(`Save fulfillment update for order ${order.orderNumber} and add it to the customer tracking timeline?`)) return;
    try {
      await updateMutation.mutateAsync({
        orderNumber: order.orderNumber,
        data: {
          fulfillmentStatus: status,
          trackingCarrier: carrier.trim() || null,
          trackingNumber: trackingNumber.trim() || null,
          trackingUrl: trackingUrl.trim() || null,
          message: message.trim() || null,
          location: location.trim() || null,
        },
      });
      setMessage("");
      setLocation("");
      setSavedMessage("Tracking update saved.");
      onSaved();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "We could not save this tracking update.");
    }
  };

  return (
    <details className="tracking-admin-editor">
      <summary>Update tracking</summary>
      <form onSubmit={(event) => void submitUpdate(event)}>
        <label>Order status
          <select value={status} onChange={(event) => setStatus(event.target.value as UpdateLocalOrderTrackingInput["fulfillmentStatus"])}>
            {FULFILLMENT_STEPS.map((step) => <option value={step.key} key={step.key}>{step.label}</option>)}
          </select>
        </label>
        <label>Carrier name<input maxLength={100} value={carrier} onChange={(event) => setCarrier(event.target.value)} placeholder="e.g. DHL" /></label>
        <label>Tracking number<input maxLength={150} value={trackingNumber} onChange={(event) => setTrackingNumber(event.target.value)} /></label>
        <label className="tracking-editor-wide">Secure tracking link<input type="url" maxLength={500} pattern="https://.*" value={trackingUrl} onChange={(event) => setTrackingUrl(event.target.value)} placeholder="https://carrier.example/track/..." /></label>
        <label>Update note<input maxLength={500} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Optional customer update" /></label>
        <label>Location<input maxLength={150} value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Optional" /></label>
        {error && <p className="tracking-editor-feedback is-error" role="alert">{error}</p>}
        {savedMessage && <p className="tracking-editor-feedback" role="status">{savedMessage}</p>}
        <button className="tracking-save-button" type="submit" disabled={updateMutation.isPending}>
          {updateMutation.isPending && <LoaderCircle className="h-4 w-4 animate-spin" />}
          Save update
        </button>
      </form>
    </details>
  );
}

function TrackingOrderCard({ order, canManage, onSaved }: { order: LocalOrder; canManage: boolean; onSaved: () => void }) {
  const activeStep = FULFILLMENT_STEPS.findIndex((step) => step.key === order.fulfillmentStatus);
  const currentLabel = STATUS_LABELS[order.fulfillmentStatus];

  return (
    <article className="tracking-order-card">
      <header className="tracking-order-heading">
        <div>
          <p className="market-section-kicker">Order {order.orderNumber}</p>
          <span>Paid {formatDate(order.paidAt ?? order.createdAt)}</span>
        </div>
        <span className={`tracking-status-pill tracking-status-pill--${order.fulfillmentStatus}`}>{currentLabel}</span>
      </header>

      <div className="tracking-progress" aria-label={`Order status: ${currentLabel}`}>
        {FULFILLMENT_STEPS.map((step, index) => (
          <div className={`tracking-progress-step ${index <= activeStep ? "is-complete" : ""}`} key={step.key}>
            <span>{index < activeStep ? <Check className="h-3.5 w-3.5" /> : index === activeStep ? <Package className="h-3.5 w-3.5" /> : null}</span>
            <small>{step.label}</small>
          </div>
        ))}
      </div>

      <div className="tracking-order-content">
        <section className="tracking-shipment">
          <div className="tracking-section-heading"><Truck className="h-4 w-4" /><strong>Shipment details</strong></div>
          {order.trackingCarrier && <p><span>Carrier</span><strong>{order.trackingCarrier}</strong></p>}
          {order.trackingNumber && <p><span>Tracking number</span><strong>{order.trackingNumber}</strong></p>}
          {order.trackingUrl && <a href={order.trackingUrl} target="_blank" rel="noreferrer">Open carrier tracking <ArrowRight className="h-4 w-4" /></a>}
          {!order.trackingCarrier && !order.trackingNumber && !order.trackingUrl && (
            <p className="tracking-not-ready">{order.fulfillmentStatus === "processing" ? "Your order is being prepared. Carrier details will appear here when it ships." : "Carrier tracking details have not been added yet."}</p>
          )}
        </section>

        {canManage && (
          <section className="tracking-customer-address">
            <div className="tracking-section-heading"><MapPin className="h-4 w-4" /><strong>Delivery address</strong></div>
            <span>{order.shippingFullName} · {order.shippingPhone}</span>
            <span>{order.shippingAddress1}{order.shippingAddress2 ? `, ${order.shippingAddress2}` : ""}, {order.shippingCity}, {order.shippingRegion}, {order.shippingCountry}{order.shippingPostalCode ? `, ${order.shippingPostalCode}` : ""}</span>
          </section>
        )}
      </div>

      <section className="tracking-timeline">
        <h3>Updates</h3>
        <ol>
          <li className="is-current">
            <span className="tracking-timeline-dot"><Package className="h-3 w-3" /></span>
            <div><strong>Order received</strong><p>Payment confirmed. Your order is being prepared.</p><time dateTime={order.paidAt ?? order.createdAt}>{formatDate(order.paidAt ?? order.createdAt)}</time></div>
          </li>
          {order.trackingEvents.map((event) => (
            <li key={event.id} className={event.status === order.fulfillmentStatus ? "is-current" : ""}>
              <span className="tracking-timeline-dot">{event.status === "delivered" ? <Check className="h-3 w-3" /> : <Truck className="h-3 w-3" />}</span>
              <div>
                <strong>{STATUS_LABELS[event.status]}</strong>
                <p>{event.message}</p>
                {event.location && <span className="tracking-event-location">{event.location}</span>}
                <time dateTime={event.createdAt}>{formatDate(event.createdAt)}</time>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {canManage && <TrackingEditor order={order} onSaved={onSaved} />}
    </article>
  );
}

export default function Tracking() {
  const { isLoading, isSignedIn } = useAuth();
  const trackingQuery = useListTrackingOrders({
    query: { queryKey: getListTrackingOrdersQueryKey(), enabled: isSignedIn },
  });
  const orders = trackingQuery.data?.orders ?? [];
  const canManage = trackingQuery.data?.canManage ?? false;

  if (isLoading || (isSignedIn && trackingQuery.isLoading)) {
    return (
      <div className="marketplace-page tracking-page">
        <div className="market-container tracking-container">
          <div className="orders-loading" aria-label="Loading tracking information">
            <span className="orders-loading-line orders-loading-line--short" />
            <span className="orders-loading-line orders-loading-line--title" />
            <span className="orders-loading-line orders-loading-line--copy" />
            <div className="orders-loading-card" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="marketplace-page tracking-page">
      <div className="market-container tracking-container">
        <header className="tracking-page-header">
          <div className="tracking-page-icon"><Truck className="h-6 w-6" /></div>
          <p className="market-section-kicker">{canManage ? "Milmarts fulfillment" : "Order tracking"}</p>
          <h1>{canManage ? "Update delivery progress." : "Keep an eye on your order."}</h1>
          <p>{canManage ? "Review paid orders and add manual status updates, carrier details, and tracking links." : "See the latest status and open your carrier tracking link when it is available."}</p>
        </header>

        {!isSignedIn ? (
          <section className="tracking-empty-card">
            <ClipboardList className="h-6 w-6" />
            <h2>Log in to track your orders.</h2>
            <p>Your paid Milmarts orders and tracking updates will appear here.</p>
            <Link className="auth-submit auth-submit--compact" href="/login">Log in <ArrowRight className="h-4 w-4" /></Link>
          </section>
        ) : trackingQuery.isError ? (
          <p className="order-history-feedback is-error" role="alert">We could not load tracking information. Please refresh and try again.</p>
        ) : orders.length === 0 ? (
          <section className="tracking-empty-card">
            <Package className="h-6 w-6" />
            <h2>{canManage ? "No paid orders need tracking yet." : "No paid orders to track yet."}</h2>
            <p>{canManage ? "Paid customer orders will appear here for manual fulfillment updates." : "Once you place and pay for an order, its status will appear here."}</p>
            {!canManage && <Link className="auth-submit auth-submit--compact" href="/shop">Browse products <ArrowRight className="h-4 w-4" /></Link>}
          </section>
        ) : (
          <section className="tracking-orders-list" aria-label="Orders to track">
            {orders.map((order) => (
              <TrackingOrderCard
                key={order.id}
                order={order}
                canManage={canManage}
                onSaved={() => void trackingQuery.refetch()}
              />
            ))}
          </section>
        )}
        <p className="tracking-history-link"><Link href="/orders">View order history <ArrowRight className="h-4 w-4" /></Link></p>
      </div>
    </div>
  );
}
