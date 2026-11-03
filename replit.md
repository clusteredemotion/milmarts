# Milmarts Stores

Milmarts Stores is a modern Shopify-powered storefront for browsing products and handing buyers off to Shopify-hosted checkout.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- Shopify env: `SHOPIFY_STORE_DOMAIN` — public `*.myshopify.com` hostname; `SHOPIFY_STOREFRONT_ACCESS_TOKEN` — server-only private Storefront API token

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/milmarts-stores/src/` — customer-facing React storefront, routes, cart context, and theme
- `artifacts/api-server/src/routes/storefront.ts` — Shopify catalog and cart API boundary
- `artifacts/api-server/src/lib/shopifyStorefrontClient.ts` — server-side Shopify Storefront API client
- `lib/api-spec/openapi.yaml` — source of truth for storefront API contracts
- `shopify-admin-api.mjs` — one-off Shopify Admin GraphQL helper for future catalog setup

## Architecture decisions

- Shopify remains the system of record for products, inventory, carts, orders, and checkout; the app does not duplicate catalog data locally.
- Buyer-facing Storefront API access is kept behind the API server so the Storefront API token never enters browser code.
- Cart refreshes rebuild a Shopify cart from the current merchandise IDs and quantities, preserving Shopify-hosted checkout as the source of truth.
- Catalog queries refresh on a one-minute interval and on window focus, so Shopify imports become visible without a manual site refresh.

## Product

- Branded home page with editorial merchandising and empty/loading/error states
- Searchable Shopify product catalog
- Product detail pages with image gallery, variant selection, quantity controls, and stock messaging
- Persistent cart review with quantity updates, removal, and Shopify checkout handoff
- Replaceable Milmarts wordmark placeholder for the future uploaded logo

## User preferences

- User plans to upload the final logo later.

## Gotchas

- Do not seed demo products during onboarding; Shopify currently returns an empty catalog until the merchant adds products.
- Shopify Storefront product connections do not expose `totalCount`; storefront result metadata is based on the products returned by the requested page.
- Do not use the broken Replit Shopify OAuth connector for this store; the direct Storefront API connection uses the server-side private Storefront token and domain environment variables.
- Shopify catalog updates use client refresh rather than webhooks; keep the polling interval reasonable and preserve cursor pagination when changing the catalog UI.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
