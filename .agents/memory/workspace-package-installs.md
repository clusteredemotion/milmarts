---
name: Workspace package installs
description: Dependency installation behavior for this pnpm monorepo.
---

Use workspace-scoped package commands when adding dependencies; adding from the repository root is rejected by pnpm's workspace-root guard.

**Why:** The package-management helper targets the monorepo root, while this project keeps dependencies in individual artifact packages.

**How to apply:** Target the relevant package filter for dependency changes, then run the affected package's typecheck and build.