import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.milmarts.stores",
  appName: "Milmarts",
  webDir: "dist/public",
  server: {
    url: "https://milmarts.app",
    cleartext: false,
    allowNavigation: ["milmarts.app", "www.milmarts.app"],
  },
};

export default config;
