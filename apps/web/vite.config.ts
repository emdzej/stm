import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { VitePWA } from "vite-plugin-pwa";

const pkg = JSON.parse(
  readFileSync(fileURLToPath(new URL("./package.json", import.meta.url)), "utf8"),
) as { version: string };

// Allow overriding the base path so the same build works at the root (custom
// domain / local preview) and under /<repo>/ on GitHub Pages.
const basePath = process.env.VITE_BASE_PATH ?? "/";

export default defineConfig({
  base: basePath,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    svelte(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg"],
      manifest: {
        name: "STM — serial monitor & terminal",
        short_name: "STM",
        description:
          "Web-based serial monitor and terminal. Native Web Serial or WebSocket tunnel.",
        theme_color: "#18181b",
        background_color: "#0b0b0e",
        display: "standalone",
        start_url: basePath,
        scope: basePath,
        icons: [{ src: "icon.svg", sizes: "any", type: "image/svg+xml" }],
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        navigateFallback: `${basePath}index.html`,
      },
    }),
  ],
  server: {
    port: 5176,
  },
  build: {
    commonjsOptions: {
      include: [/node_modules/, /packages\//],
      transformMixedEsModules: true,
    },
  },
});
