---
name: Shopify connection lifecycle
description: Replit's supported Shopify connection model for storefront projects.
---

Replit's managed Shopify Store integration provisions a new Replit-owned development store; it does not directly attach an existing merchant-owned Shopify store as the system of record.

**Why:** The official Replit Shopify integration flow is designed around provisioning, claiming, and transferring a development store rather than importing an existing store connection.

**How to apply:** Explain the distinction before asking a merchant to connect. Use the integration flow for a new development store, or scope a separate custom Shopify OAuth/API architecture if the merchant requires an existing store's exact catalog and domain.