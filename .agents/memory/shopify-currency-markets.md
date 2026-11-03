---
name: Shopify currency markets
description: How Shopify country context affects the Milmarts storefront and embedded checkout currency
---

Shopify Storefront API country context may return market-specific prices only when the Shopify market is configured; it does not itself convert the store’s price. Use Shopify’s returned amount and `currencyCode` as the checkout source of truth. The storefront may convert that amount to the visitor’s IP-derived currency for display, but must keep the original price visible as an estimate and never imply Shopify will charge the converted amount. The ExchangeRate-API source refreshes daily and requires attribution; do not describe it as live.

**Why:** The live Milmarts catalog returned USD despite requesting country code NG, so the converted local display is an estimate unless Shopify Markets is configured to charge in that currency.

**How to apply:** Resolve the visitor’s country for product context, convert Shopify amounts with the cached daily rate table, and disclose that checkout confirms the final currency and amount. To charge in a local currency, configure the corresponding Shopify market.