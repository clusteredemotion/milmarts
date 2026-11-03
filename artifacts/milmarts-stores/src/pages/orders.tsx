import { useState } from "react";
import {
  ArrowRight,
  Check,
  ClipboardList,
  LockKeyhole,
  Package,
  Search,
  Sparkles,
  Truck,
} from "lucide-react";
import { Link } from "wouter";
import { getListLocalOrdersQueryKey, useListLocalOrders, useReconcileFlutterwaveOrderPayment, type LocalOrder } from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";

function formatNaira(kobo: number) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 2,
  }).format(kobo / 100);
}

function statusLabel(order: LocalOrder) {
  if (order.paymentStatus === "pending") return "Payment pending";
  if (order.paymentStatus === "failed") return order.status === "payment_cancelled" ? "Payment cancelled" : "Payment failed";
  return order.status === "processing" ? "Processing" : order.status.replaceAll("_", " ");
}

export default function Orders() {
  const { isLoading, isSignedIn, user } = useAuth();
  const ordersQuery = useListLocalOrders({ query: { queryKey: getListLocalOrdersQueryKey(), enabled: isSignedIn } });
  const reconcilePayment = useReconcileFlutterwaveOrderPayment();
  const [paymentMessage, setPaymentMessage] = useState("");
  const [paymentError, setPaymentError] = useState("");

  const refreshPaymentStatus = async (orderNumber: string) => {
    setPaymentMessage("");
    setPaymentError("");
    try {
      const order = await reconcilePayment.mutateAsync({ orderNumber });
      setPaymentMessage(order.paymentStatus === "paid"
        ? `Payment confirmed for ${order.orderNumber}.`
        : `Payment for ${order.orderNumber} is still pending.`);
      await ordersQuery.refetch();
    } catch (error) {
      setPaymentError(error instanceof Error ? error.message : "We could not check the payment yet.");
    }
  };

  if (isLoading || (isSignedIn && ordersQuery.isLoading)) {
    return (
      <div className="marketplace-page orders-page">
        <div className="market-container orders-container">
          <div className="orders-loading" aria-label="Loading orders">
            <span className="orders-loading-line orders-loading-line--short" />
            <span className="orders-loading-line orders-loading-line--title" />
            <span className="orders-loading-line orders-loading-line--copy" />
            <div className="orders-loading-card" />
          </div>
        </div>
      </div>
    );
  }

  const orders = ordersQuery.data?.orders ?? [];
  const queryError = ordersQuery.error instanceof Error ? ordersQuery.error.message : "";

  return (
    <div className="marketplace-page orders-page">
      <div className="market-container orders-container">
        <section className="orders-hero">
          <div className="orders-hero-copy">
            <div className="orders-eyebrow"><ClipboardList className="h-4 w-4" /> Order desk</div>
            <p className="market-section-kicker">{isSignedIn ? `Welcome back${user?.firstName ? `, ${user.firstName}` : ""}` : "Your orders"}</p>
            <h1>{isSignedIn ? "Good things, all in one place." : "Your next good thing starts here."}</h1>
            <p className="orders-hero-description">
              {isSignedIn
                ? "Track Milmarts orders, check payment status, and review the items and delivery details."
                : "Sign in to keep your Milmarts orders and delivery details together."}
            </p>
            <div className="orders-hero-actions">
              <Link className="auth-submit auth-submit--compact" href={isSignedIn ? "/shop" : "/login"}>
                {isSignedIn ? "Shop the shelf" : "Log in"} <ArrowRight className="h-4 w-4" />
              </Link>
              {!isSignedIn && <Link className="orders-secondary-button" href="/signup">Create account</Link>}
            </div>
          </div>

          <div className="orders-journey-card">
            <div className="orders-journey-orbit orders-journey-orbit--one" />
            <div className="orders-journey-orbit orders-journey-orbit--two" />
            <div className="orders-journey-icon"><Package className="h-7 w-7" /></div>
            <p className="orders-card-kicker">The order journey</p>
            <h2>From checkout to doorstep.</h2>
            <div className="orders-journey-steps">
              <div className="orders-journey-step is-complete"><span><Check className="h-3.5 w-3.5" /></span><small>Placed</small></div>
              <div className="orders-journey-connector" />
              <div className="orders-journey-step"><span><Truck className="h-3.5 w-3.5" /></span><small>On the way</small></div>
              <div className="orders-journey-connector" />
              <div className="orders-journey-step"><span><Sparkles className="h-3.5 w-3.5" /></span><small>Delivered</small></div>
            </div>
          </div>
        </section>

        {paymentMessage && <p className="order-history-feedback" role="status">{paymentMessage}</p>}
        {paymentError && <p className="order-history-feedback is-error" role="alert">{paymentError}</p>}
        {queryError && <p className="order-history-feedback is-error" role="alert">We could not load your local Milmarts orders. {queryError}</p>}

        <section className="orders-content-grid">
          <div className="orders-history-column">
            {isSignedIn && orders.length > 0 ? (
              orders.map((order) => (
                <article className="local-order-card" key={order.id}>
                  <header className="local-order-header">
                    <div>
                      <p className="market-section-kicker">Order {order.orderNumber}</p>
                      <span>{new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short" }).format(new Date(order.createdAt))}</span>
                    </div>
                    <span className={`local-order-status local-order-status--${order.paymentStatus}`}>{statusLabel(order)}</span>
                  </header>
                  <div className="local-order-items">
                    {order.items.map((item) => (
                      <div className="local-order-item" key={`${order.id}-${item.merchandiseId}`}>
                        <span>{item.title} <small>× {item.quantity}</small></span>
                        <strong>{formatNaira(item.lineTotalKobo)}</strong>
                      </div>
                    ))}
                  </div>
                  <div className="local-order-total">
                    <span>{order.paymentMethod === "wallet" ? "Paid from Milmarts wallet" : "Paid by card via Flutterwave"}</span>
                    <strong>{formatNaira(order.totalKobo)}</strong>
                  </div>
                  <div className="local-order-address">
                    <strong>Delivery address</strong>
                    <span>{order.shippingFullName} · {order.shippingPhone}</span>
                    <span>{order.shippingAddress1}{order.shippingAddress2 ? `, ${order.shippingAddress2}` : ""}, {order.shippingCity}, {order.shippingRegion}, {order.shippingCountry}{order.shippingPostalCode ? `, ${order.shippingPostalCode}` : ""}</span>
                  </div>
                  {order.deliveryPricingPending && <p className="local-order-delivery-note">Delivery is not included in this payment. Milmarts will confirm the delivery price separately.</p>}
                  {order.paymentMethod === "card" && order.paymentStatus === "pending" && (
                    <button className="local-order-check-payment" type="button" disabled={reconcilePayment.isPending} onClick={() => void refreshPaymentStatus(order.orderNumber)}>
                      {reconcilePayment.isPending ? "Checking…" : "Check payment status"}
                    </button>
                  )}
                </article>
              ))
            ) : (
              <div className="orders-empty-card">
                <div className="orders-empty-icon"><Search className="h-6 w-6" /></div>
                <p className="market-section-kicker">{isSignedIn ? "Your order shelf" : "Member orders"}</p>
                <h2>{isSignedIn ? "No Milmarts orders yet." : "Sign in to see your orders."}</h2>
                <p>
                  {isSignedIn
                    ? "Orders paid from your Milmarts wallet or through Flutterwave will appear here."
                    : "Log in to see your local Milmarts order history."}
                </p>
                <div className="orders-empty-actions">
                  <Link className="orders-primary-link" href={isSignedIn ? "/shop" : "/login"}>{isSignedIn ? "Discover products" : "Log in"} <ArrowRight className="h-4 w-4" /></Link>
                  {isSignedIn && <Link className="orders-text-link" href="/account">View account</Link>}
                </div>
              </div>
            )}
          </div>

          <aside className="orders-side-card">
            <div className="orders-side-card-icon"><LockKeyhole className="h-5 w-5" /></div>
            <p className="orders-card-kicker">Shop with ease</p>
            <h2>Every detail, kept close.</h2>
            <p>Your paid orders stay in Milmarts. Product payments are recorded here, and delivery pricing is confirmed separately.</p>
          </aside>
        </section>
      </div>
    </div>
  );
}
