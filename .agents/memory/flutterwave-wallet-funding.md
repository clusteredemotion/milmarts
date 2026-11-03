---
name: Flutterwave wallet funding
description: Payment-provider decision and safety constraints for Milmarts wallet credits.
---

Milmarts wallet funding uses Flutterwave Standard hosted checkout inside a Milmarts-sized modal, with a server-created transaction reference and server-side verification, because Flutterwave is not available as a Replit integration in this workspace. The iframe return can be missed, so authenticated account visits and post-checkout focus/close should reconcile recent pending payments by transaction reference.

**Why:** A completed hosted payment can fail to return to the embedded callback, leaving a pending record even though the customer paid. Wallet balances represent stored value, so only Flutterwave server verification may credit funds.

**How to apply:** Create a pending reference server-side, load the hosted link in the dashboard modal, and verify either the callback transaction ID or Flutterwave’s server-side verify-by-reference result against the reference, NGN currency, and expected amount. Claim the pending record transactionally before crediting; keep `FLW_SECRET_KEY` server-only.

Milmarts physical orders use local Milmarts checkout and local order records, not Shopify checkout or Shopify order creation. Product/cart data still comes from Shopify Storefront, but the order total is recomputed server-side in NGN. Wallet orders atomically debit the Milmarts balance; card orders use Flutterwave Standard in the in-page modal and stay pending until server verification. Current checkout charges only the product subtotal; delivery is priced separately later.

**Why:** The user explicitly chose local Milmarts orders, direct Milmarts wallet payment or Flutterwave card payment, and product-subtotal-only charging while delivery pricing is deferred. These local orders do not appear in Shopify or decrement Shopify inventory.

**How to apply:** Keep checkout and order writes in Milmarts. Recalculate cart prices on the server, charge NGN only, debit the wallet transactionally or verify Flutterwave's transaction reference, amount, currency, and status before marking an order processing. Do not create Shopify orders or assume Shopify inventory changes. Keep delivery charges out of the initial order total until the user sets delivery pricing.