import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, Check, CreditCard, LoaderCircle, WalletCards, X } from "lucide-react";
import { Link } from "wouter";
import type { Cart, LocalOrder, LocalOrderCheckoutInput, FlutterwaveOrderPayment } from "@workspace/api-client-react";
import { usePayForOrderWithWallet, useReconcileFlutterwaveOrderPayment, useStartFlutterwaveOrderPayment } from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
import { useStorefrontCart } from "@/components/storefront-shell";

type DeliveryDetails = {
  fullName: string;
  phone: string;
  address1: string;
  address2: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
};
type CheckoutStep = "sign-in" | "delivery" | "payment" | "card" | "pending" | "success";

const DEFAULT_DELIVERY: DeliveryDetails = {
  fullName: "",
  phone: "",
  address1: "",
  address2: "",
  city: "",
  region: "",
  postalCode: "",
  country: "Nigeria",
};

function formatNaira(kobo: number) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 2,
  }).format(kobo / 100);
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function OrderCheckoutModal({ cart, onClose }: { cart: Cart; onClose: () => void }) {
  const { user, refreshUser } = useAuth();
  const { clearCart } = useStorefrontCart();
  const walletPayment = usePayForOrderWithWallet();
  const cardPayment = useStartFlutterwaveOrderPayment();
  const reconcilePayment = useReconcileFlutterwaveOrderPayment();
  const [step, setStep] = useState<CheckoutStep>(user ? "delivery" : "sign-in");
  const [delivery, setDelivery] = useState<DeliveryDetails>(() => ({
    ...DEFAULT_DELIVERY,
    fullName: user ? `${user.firstName} ${user.lastName}`.trim() : "",
    phone: user?.phone ?? "",
  }));
  const [paymentSession, setPaymentSession] = useState<FlutterwaveOrderPayment | null>(null);
  const [order, setOrder] = useState<LocalOrder | null>(null);
  const [pendingOrderNumber, setPendingOrderNumber] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [checkingPayment, setCheckingPayment] = useState(false);
  const nairaEstimate = cart.subtotalInNaira?.amount
    ? Number(cart.subtotalInNaira.amount)
    : null;
  const isBusy = walletPayment.isPending || cardPayment.isPending || checkingPayment;

  useEffect(() => {
    if (!user) {
      setStep("sign-in");
      return;
    }
    setDelivery((current) => ({
      ...current,
      fullName: current.fullName || `${user.firstName} ${user.lastName}`.trim(),
      phone: current.phone || user.phone,
    }));
  }, [user]);

  const checkoutInput = useMemo<LocalOrderCheckoutInput | null>(() => {
    const cartId = cart.id;
    if (!cartId) return null;
    return {
      cartId,
      lines: cart.lines.map((line) => ({
        merchandiseId: line.merchandiseId,
        quantity: line.quantity,
      })),
      idempotencyKey,
      shippingFullName: delivery.fullName.trim(),
      shippingPhone: delivery.phone.trim(),
      shippingAddress1: delivery.address1.trim(),
      shippingAddress2: delivery.address2.trim() || null,
      shippingCity: delivery.city.trim(),
      shippingRegion: delivery.region.trim(),
      shippingPostalCode: delivery.postalCode.trim() || null,
      shippingCountry: delivery.country.trim(),
    };
  }, [cart.id, delivery, idempotencyKey]);

  const updateDelivery = (field: keyof DeliveryDetails, value: string) => {
    setDelivery((current) => ({ ...current, [field]: value }));
  };

  const handleDeliverySubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setNotice("");
    setStep("payment");
  };

  const completeOrder = (paidOrder: LocalOrder) => {
    setOrder(paidOrder);
    setPendingOrderNumber(paidOrder.orderNumber);
    setError("");
    setNotice("");
    setStep("success");
    setPaymentSession(null);
    clearCart();
    void refreshUser();
  };

  const checkPaymentStatus = async (orderNumber = pendingOrderNumber) => {
    if (!orderNumber) return;
    setCheckingPayment(true);
    setError("");
    try {
      const currentOrder = await reconcilePayment.mutateAsync({ orderNumber });
      if (currentOrder.paymentStatus === "paid" && currentOrder.status === "processing") {
        completeOrder(currentOrder);
      } else if (currentOrder.paymentStatus === "failed") {
        setStep("payment");
        setPaymentSession(null);
        setIdempotencyKey(crypto.randomUUID());
        setNotice("");
        setError(currentOrder.status === "payment_cancelled"
          ? "The card payment was cancelled. Choose a payment method to continue."
          : "The card payment did not complete. Choose a payment method to try again.");
      } else {
        setNotice("Flutterwave has not confirmed this payment yet. Check again before starting another payment.");
      }
    } catch (checkError) {
      setError(errorMessage(checkError, "We could not check the payment yet. Please try again."));
    } finally {
      setCheckingPayment(false);
    }
  };

  useEffect(() => {
    if (!paymentSession) return;
    const handlePaymentMessage = (event: MessageEvent) => {
      if (
        event.origin !== window.location.origin ||
        event.data?.type !== "milmarts-order-payment" ||
        event.data?.orderNumber !== paymentSession.orderNumber
      ) {
        return;
      }
      setPaymentSession(null);
      setPendingOrderNumber(paymentSession.orderNumber);
      if (event.data.status === "cancelled") {
        setError("Payment was cancelled. You can choose another payment method.");
        setNotice("");
        setIdempotencyKey(crypto.randomUUID());
        setStep("payment");
        return;
      }
      setStep("pending");
      if (event.data.status === "failed") {
        setNotice("We are checking whether Flutterwave completed the payment. Please check its status before trying again.");
      }
      void checkPaymentStatus(paymentSession.orderNumber);
    };
    window.addEventListener("message", handlePaymentMessage);
    return () => window.removeEventListener("message", handlePaymentMessage);
  }, [paymentSession]);

  const payFromWallet = async () => {
    if (!checkoutInput) return;
    setError("");
    setNotice("");
    try {
      const paidOrder = await walletPayment.mutateAsync({ data: checkoutInput });
      completeOrder(paidOrder);
    } catch (paymentError) {
      setError(errorMessage(paymentError, "We could not complete the wallet payment."));
    }
  };

  const payByCard = async () => {
    if (!checkoutInput) return;
    setError("");
    setNotice("");
    try {
      const session = await cardPayment.mutateAsync({ data: checkoutInput });
      setPaymentSession(session);
      setPendingOrderNumber(session.orderNumber);
      setStep("card");
    } catch (paymentError) {
      setError(errorMessage(paymentError, "Flutterwave could not start this payment."));
      setIdempotencyKey(crypto.randomUUID());
    }
  };

  const closeModal = () => {
    if (step === "success") clearCart();
    onClose();
  };

  const orderTotal = order ? formatNaira(order.totalKobo) : null;
  const estimatedNaira = nairaEstimate === null
    ? "Unavailable"
    : formatNaira(Math.round(nairaEstimate * 100));

  return (
    <div
      className="wallet-payment-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isBusy) closeModal();
      }}
    >
      <section
        className="wallet-payment-modal order-checkout-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="order-checkout-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="wallet-payment-modal-header">
          <div>
            <p className="market-section-kicker">Secure checkout</p>
            <h2 id="order-checkout-title">
              {step === "success" ? "Order received" : step === "card" ? "Pay with Flutterwave" : "Complete your order"}
            </h2>
          </div>
          <button className="wallet-payment-close" type="button" onClick={closeModal} aria-label="Close checkout">
            <X className="h-4 w-4" />
          </button>
        </header>

        {step === "sign-in" && (
          <div className="order-checkout-content order-checkout-centered">
            <p>Sign in to use your Milmarts wallet and keep this order in your account.</p>
            <Link className="auth-submit auth-submit--compact" href="/login">Log in to continue <ArrowRight className="h-4 w-4" /></Link>
          </div>
        )}

        {step === "delivery" && (
          <form className="order-checkout-content order-delivery-form" onSubmit={handleDeliverySubmit}>
            <p className="order-checkout-intro">Add the address for this order. Delivery pricing will be confirmed separately.</p>
            <div className="order-delivery-fields">
              <label>Full name<input required maxLength={100} autoComplete="name" value={delivery.fullName} onChange={(event) => updateDelivery("fullName", event.target.value)} /></label>
              <label>Phone number<input required maxLength={40} autoComplete="tel" value={delivery.phone} onChange={(event) => updateDelivery("phone", event.target.value)} /></label>
              <label className="order-delivery-wide">Address line 1<input required minLength={5} maxLength={250} autoComplete="address-line1" value={delivery.address1} onChange={(event) => updateDelivery("address1", event.target.value)} /></label>
              <label className="order-delivery-wide">Address line 2 <span>Optional</span><input maxLength={250} autoComplete="address-line2" value={delivery.address2} onChange={(event) => updateDelivery("address2", event.target.value)} /></label>
              <label>City<input required minLength={2} maxLength={100} autoComplete="address-level2" value={delivery.city} onChange={(event) => updateDelivery("city", event.target.value)} /></label>
              <label>State or region<input required minLength={2} maxLength={100} autoComplete="address-level1" value={delivery.region} onChange={(event) => updateDelivery("region", event.target.value)} /></label>
              <label>Postal code <span>Optional</span><input maxLength={30} autoComplete="postal-code" value={delivery.postalCode} onChange={(event) => updateDelivery("postalCode", event.target.value)} /></label>
              <label>Country<input required minLength={2} maxLength={100} autoComplete="country-name" value={delivery.country} onChange={(event) => updateDelivery("country", event.target.value)} /></label>
            </div>
            <div className="order-checkout-footer">
              <p>Pay now: <strong>{estimatedNaira}</strong><small>NGN · products only</small></p>
              <button className="auth-submit auth-submit--compact" type="submit">Continue to payment <ArrowRight className="h-4 w-4" /></button>
            </div>
          </form>
        )}

        {step === "payment" && (
          <div className="order-checkout-content">
            <button className="order-checkout-back" type="button" onClick={() => { setError(""); setNotice(""); setStep("delivery"); }}>
              <ArrowLeft className="h-4 w-4" /> Delivery details
            </button>
            <div className="order-payment-summary">
              <span>Product subtotal</span><strong>{estimatedNaira}</strong>
              <span>Delivery</span><strong>Priced later</strong>
              <p>Only the product subtotal is charged now. Delivery is not included and will be priced separately.</p>
            </div>
            <div className="order-payment-options">
              <button type="button" onClick={() => void payFromWallet()} disabled={isBusy || nairaEstimate === null}>
                {walletPayment.isPending ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <WalletCards className="h-5 w-5" />}
                <span><strong>Pay from Milmarts wallet</strong><small>Balance: {user ? formatNaira(user.walletBalanceKobo) : "Sign in required"}</small></span>
                <ArrowRight className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => void payByCard()} disabled={isBusy || nairaEstimate === null}>
                {cardPayment.isPending ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <CreditCard className="h-5 w-5" />}
                <span><strong>Pay with card</strong><small>Flutterwave opens in this window</small></span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
            {nairaEstimate === null && <p className="order-checkout-message is-error">The Naira total is unavailable right now. Please refresh your cart and try again.</p>}
            {error && <p className="order-checkout-message is-error" role="alert">{error}</p>}
            {notice && <p className="order-checkout-message" role="status">{notice}</p>}
          </div>
        )}

        {step === "card" && paymentSession && (
          <>
            <div className="order-payment-frame-caption">
              <span>Order {paymentSession.orderNumber}</span>
              <strong>{formatNaira(paymentSession.totalKobo)}</strong>
            </div>
            <iframe className="wallet-payment-frame" title="Flutterwave secure card payment" src={paymentSession.paymentUrl} allow="payment *" />
          </>
        )}

        {step === "pending" && (
          <div className="order-checkout-content order-checkout-centered">
            <div className="order-pending-icon"><LoaderCircle className="h-7 w-7" /></div>
            <h3>Confirming your payment</h3>
            <p>{notice || "We are verifying the Flutterwave payment. Your order will not be marked as processing until it is confirmed."}</p>
            {error && <p className="order-checkout-message is-error" role="alert">{error}</p>}
            <button className="auth-submit auth-submit--compact" type="button" disabled={isBusy} onClick={() => void checkPaymentStatus()}>
              {checkingPayment ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Check payment status
            </button>
          </div>
        )}

        {step === "success" && order && (
          <div className="order-checkout-content order-checkout-centered">
            <div className="order-success-icon"><Check className="h-7 w-7" /></div>
            <p className="market-section-kicker">Order {order.orderNumber}</p>
            <h3>Your order is received and processing.</h3>
            <p>Payment confirmed: {orderTotal} by {order.paymentMethod === "wallet" ? "Milmarts wallet" : "card via Flutterwave"}.</p>
            <p className="order-delivery-disclosure">Delivery is not included in this payment. Milmarts will confirm its price separately.</p>
            <div className="order-success-actions">
              <Link className="auth-submit auth-submit--compact" href="/orders">View my orders <ArrowRight className="h-4 w-4" /></Link>
              <button className="order-checkout-back" type="button" onClick={closeModal}>Continue shopping</button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
