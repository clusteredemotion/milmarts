---
name: Wouter hash navigation
description: The browser behavior to account for when SPA section links use Wouter.
---

Wouter handles links through `history.pushState`, so a URL hash can update without triggering the browser's native anchor scroll.

**Why:** Homepage section links can appear to navigate correctly from another route while leaving the user at the top of the page.

**How to apply:** For internal links that combine a route and hash, preserve SPA navigation but explicitly scroll the target element after the route transition; also handle an initial hash on page load.