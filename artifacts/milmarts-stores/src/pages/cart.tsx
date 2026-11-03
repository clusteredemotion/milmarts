import { ArrowRight, Minus, Plus, ShieldCheck, ShoppingBag, Trash2, Truck } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";
import type { Cart, Money } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { useStorefrontCart } from "@/components/storefront-shell";
import { ShopifyPrice } from "@/components/shopify-price";
import { OrderCheckoutModal } from "@/components/order-checkout-modal";

function multiplyMoney(price: Money, quantity: number): Money {
  return { ...price, amount: String(Number(price.amount) * quantity) };
}

function formatNaira(amount: string) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 2,
  }).format(Number(amount));
}

export default function Cart() {
  const { cart, setLineQuantity, refreshCart, isUpdating, cartError, clearCartError } = useStorefrontCart();
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutCart, setCheckoutCart] = useState<Cart | null>(null);

  const openCheckout = async () => {
    if (!cart || isUpdating) return;
    clearCartError();
    const latestCart = await refreshCart();
    if (!latestCart?.lines.length) return;
    setCheckoutCart(latestCart);
    setCheckoutOpen(true);
  };
  const closeCheckout = () => {
    setCheckoutOpen(false);
    setCheckoutCart(null);
  };
  const updateQuantity = (merchandiseId: string, quantity: number) => {
    clearCartError();
    void setLineQuantity(merchandiseId, quantity);
  };

  const hasCart = Boolean(cart?.lines.length);

  return (
    <>
      {hasCart && cart ? (
        <div className="marketplace-page">
          <div className="market-container cart-page">
            <div className="catalog-breadcrumb"><Link href="/">Home</Link><span>/</span><span>Cart</span></div>
            <div className="cart-heading"><div><p className="market-section-kicker">Ready when you are</p><h1>Shopping cart</h1></div><p data-testid="text-cart-total-quantity">{cart.totalQuantity} {cart.totalQuantity === 1 ? "item" : "items"}</p></div>
            {cartError && <div className="cart-error" data-testid="error-cart-update">{cartError}</div>}
            <div className="cart-layout">
              <section className="cart-lines-card" data-testid="cart-lines">
                <div className="cart-card-heading"><h2>Your items</h2><span>Price</span></div>
                {cart.lines.map((line) => {
                  const lineTotal = multiplyMoney(line.price, line.quantity);
                  return <div className="cart-line" key={line.id} data-testid={`row-cart-line-${line.id}`}>
                    <div className="cart-line-image">{line.image?.url ? <img src={line.image.url} alt={line.image.altText || line.title} data-testid={`img-cart-line-${line.id}`} /> : <span>{line.title}</span>}</div>
                    <div className="cart-line-content">
                      <div>
                        <span className="cart-line-title" data-testid={`text-cart-line-title-${line.id}`}>{line.title}</span>
                        <div className="cart-line-unit"><ShopifyPrice amount={line.price} /><span>each</span></div>
                      </div>
                      <div className="cart-line-actions">
                        <div className="cart-line-price" data-testid={`text-cart-line-price-${line.id}`}><ShopifyPrice amount={lineTotal} /></div>
                        <div className="cart-quantity"><button onClick={() => updateQuantity(line.merchandiseId, line.quantity - 1)} aria-label={`Decrease ${line.title}`} disabled={isUpdating} data-testid={`button-decrease-line-${line.id}`}><Minus className="h-3.5 w-3.5" /></button><span data-testid={`text-line-quantity-${line.id}`}>{line.quantity}</span><button onClick={() => updateQuantity(line.merchandiseId, line.quantity + 1)} aria-label={`Increase ${line.title}`} disabled={isUpdating} data-testid={`button-increase-line-${line.id}`}><Plus className="h-3.5 w-3.5" /></button><button className="cart-remove" onClick={() => updateQuantity(line.merchandiseId, 0)} aria-label={`Remove ${line.title}`} disabled={isUpdating} data-testid={`button-remove-line-${line.id}`}><Trash2 className="h-3.5 w-3.5" /></button></div>
                      </div>
                    </div>
                  </div>;
                })}
                <Link href="/shop" className="cart-continue"><ArrowRight className="h-4 w-4 rotate-180" /> Continue shopping</Link>
              </section>
              <aside className="cart-summary">
                <div className="cart-summary-heading"><h2>Order summary</h2><span>{cart.totalQuantity} items</span></div>
                <div className="cart-summary-row"><span>Subtotal</span><div className="cart-summary-price" data-testid="text-cart-subtotal"><ShopifyPrice amount={cart.subtotal} /></div></div>
                <div className="cart-summary-row"><span>Delivery</span><span>Priced later</span></div>
                <div className="cart-summary-divider" />
                <div className="cart-summary-row"><strong>Amount due now</strong><strong className="cart-summary-price">{cart.subtotalInNaira?.amount ? formatNaira(cart.subtotalInNaira.amount) : "Unavailable"}</strong></div>
                <p className="cart-currency-disclosure">Payments are charged in Nigerian Naira. The amount due now covers products only; delivery will be priced separately.</p>
                 <Button className="cart-checkout-button" onClick={openCheckout} disabled={!cart.subtotalInNaira?.amount || isUpdating} data-testid="button-checkout">{isUpdating ? "Checking prices…" : "Checkout securely"} <ArrowRight className="h-4 w-4" /></Button>
                <p className="cart-secure-note"><ShieldCheck className="h-4 w-4" /> Choose Milmarts wallet or Flutterwave card payment</p>
                <div className="cart-benefits"><span><Truck className="h-4 w-4" /> Delivery price confirmed later</span><span><ShieldCheck className="h-4 w-4" /> Secure payment on Milmarts</span></div>
              </aside>
            </div>
          </div>
        </div>
      ) : (
        <div className="marketplace-page">
          <div className="market-empty-state cart-empty" data-testid="empty-cart"><div className="cart-empty-icon"><ShoppingBag className="h-8 w-8" /></div><p>Your cart</p><h1>Your cart is empty</h1><span>The best carts start with one good thing. Take a look around and find yours.</span><Button asChild><Link href="/shop" data-testid="button-empty-cart-shop">Start shopping <ArrowRight className="h-4 w-4" /></Link></Button></div>
        </div>
      )}
      {checkoutOpen && checkoutCart && <OrderCheckoutModal cart={checkoutCart} onClose={closeCheckout} />}
    </>
  );
}
