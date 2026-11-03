---
name: GitHub pushes from Replit
description: Git transport fallback when a GitHub API connector is unavailable.
---

If `listConnections` is empty while a GitHub integration is authorized, do not extract or expose credentials. Test the normal HTTPS remote with `git ls-remote`; Replit's Git transport may rewrite GitHub URLs through authenticated internal transport. If the remote already has a bootstrap commit, fetch remote `main` and push a child commit so the update is fast-forward. Never force-push.

**Why:** The API connection remained unavailable while the normal Git CLI push succeeded; the local branch did not initially descend from the remote bootstrap commit.

**How to apply:** Check the current remote tip first, then use the regular authenticated Git transport and keep credentials out of commands and logs.
