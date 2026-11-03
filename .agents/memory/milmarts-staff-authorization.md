---
name: Milmarts staff authorization
description: Authorization constraints for privileged access to local Milmarts accounts.
---

Grant privileged access to a specific local user ID, configured separately for development and production. Never authorize a staff account by email alone.

**Why:** Local signup does not verify email ownership, so an email allowlist can be claimed by an unrelated account.

**How to apply:** Confirm the intended staff account exists in each target environment, then configure its user ID. If it does not exist, ask the owner to create it before enabling staff controls.
