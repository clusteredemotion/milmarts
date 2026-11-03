# Milmarts Android wrapper

The Android app opens the live Milmarts website at `https://milmarts.app`, so
the website and API remain the source of truth for sign-in, catalog, checkout,
wallet, orders, and admin features.

## Build locally

From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm --filter @workspace/milmarts-stores run build:android
```

The debug APK is written to:

```text
artifacts/milmarts-stores/android/app/build/outputs/apk/debug/app-debug.apk
```

## Build on GitHub

Pushing to `main` runs `.github/workflows/build-android-apk.yml`. Download
`milmarts-debug-apk` from that workflow run's artifacts.

This produces a debug-signed APK for installation and testing. It is not signed
for Google Play release.
