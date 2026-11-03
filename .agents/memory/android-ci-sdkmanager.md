---
name: Android CI SDK setup
description: Avoid retired Android SDK packages in GitHub Actions.
---

Use `android-actions/setup-android` with `packages: platform-tools` on current hosted runners, and install required `platforms;android-*` and `build-tools;*` packages explicitly. Do not rely on the action's default `tools platform-tools` list because `tools` is retired.

**Why:** The APK workflow stopped during SDK setup when modern `sdkmanager` could not find the legacy `tools` package.

**How to apply:** When updating Android CI or SDK levels, set the action's package input explicitly before invoking Gradle.
