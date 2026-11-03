import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.milmarts.stores",
  appName: "Milmarts",
  webDir: "android-shell",
  server: {
    cleartext: false,
    allowNavigation: ["milmarts.app", "www.milmarts.app"],
  },
};

export default config;
