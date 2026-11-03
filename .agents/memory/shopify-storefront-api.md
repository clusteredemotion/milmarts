---
name: Shopify Storefront API quirks
description: Provider-specific constraints that affect the Milmarts storefront boundary.
---

Shopify Storefront product connections may not expose `totalCount`; private Storefront tokens also require the private-token header and may omit inventory fields without the matching scope.

**Why:** The connected Storefront schema rejected `totalCount`, and a valid private token initially failed until the private-token header was used; Shopify then returned a scope error for `quantityAvailable`.

**How to apply:** Keep product list queries limited to supported connection fields, use `X-Shopify-Storefront-Private-Token` for private tokens, and avoid requesting inventory quantities unless the token has `unauthenticated_read_product_inventory`.

For this store, `cartCreate` with `buyerIdentity.countryCode: NG` returned cart lines with quantity `0` and no Shopify user errors; creating the cart without a country identity returned the requested quantities. Existing zero-quantity carts can be rebuilt from the desired positive-quantity lines.

**Why:** Live Storefront mutations showed Nigeria-bound carts could contain visible lines that were unusable in checkout, while the same variants worked without the prefilled country.

**How to apply:** Do not prefill the country during cart creation. When updating a legacy cart with zero-quantity lines, recreate it from the requested positive-quantity lines and let checkout collect the delivery country.