import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";

// Structure follows Webflow's hello-world-astro starter for Webflow Cloud.
// https://astro.build/config
export default defineConfig({
  base: "CLOUD_MOUNT_PATH", // replaced by Webflow Cloud with the app's mount path, e.g. /hooks
  output: "server",
  adapter: cloudflare({
    platformProxy: {
      enabled: true,
    },
  }),
});
