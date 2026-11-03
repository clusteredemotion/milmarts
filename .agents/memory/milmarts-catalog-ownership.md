---
name: Milmarts catalog ownership
description: Durable product and order ownership boundaries between Shopify and Milmarts.
---

Shopify is only a read-only product import source. Milmarts owns product records, prices, categories, cart, checkout, and local orders; staff place paid orders with suppliers manually.

**Why:** the user specified that products are imported from Shopify and then handled entirely by Milmarts, with no user-order writeback to Shopify.

**How to apply:** Keep all customer-facing product, price, cart, checkout, and order behavior on Milmarts records. Use Shopify only for explicit read-only catalog imports.
