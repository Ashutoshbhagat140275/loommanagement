import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import path from "node:path";

export default defineConfig(({ mode }) => {
  const rootEnv = loadEnv(mode, path.resolve(import.meta.dirname, "../.."), "VITE_");
  const apiUrl = rootEnv["VITE_API_URL"] ?? "http://localhost:3001";

  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: "autoUpdate",
        includeAssets: ["apple-touch-icon.png"],
        manifest: {
          name: "Loom Management",
          short_name: "Loom",
          description:
            "Production, stock and wages for saree weaving factories",
          lang: "en",
          start_url: "/",
          scope: "/",
          display: "standalone",
          orientation: "portrait",
          background_color: "#f8fafc",
          theme_color: "#0f172a",
          icons: [
            { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
            { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
            {
              src: "/icon-maskable-512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "maskable",
            },
          ],
        },
        workbox: {
          navigateFallback: "index.html",
          runtimeCaching: [
            {
              // Only what a weaver needs to see at the loom, and only as a
              // fallback: the network is tried first, so a working connection
              // always wins. Writes never come from here; they go through the
              // outbox in src/lib/outbox.ts.
              urlPattern: new RegExp(
                `^${apiUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/api/(me|my/saree-jobs)$`,
              ),
              handler: "NetworkFirst",
              method: "GET",
              options: {
                cacheName: "loom-api",
                networkTimeoutSeconds: 5,
                expiration: { maxEntries: 16, maxAgeSeconds: 60 * 60 * 24 * 7 },
                cacheableResponse: { statuses: [200] },
              },
            },
          ],
        },
        // The dev service worker fails to register here ("unknown error
        // occurred when fetching the script") as both a module and a classic
        // worker, so it is left off rather than throwing on every dev reload.
        // Check the service worker against a build: `pnpm -F @loom/web build`
        // then `preview`. Offline entry itself does not depend on it — the
        // outbox is plain IndexedDB and works in dev.
        devOptions: { enabled: false },
      }),
    ],
    resolve: {
      alias: { "@": path.resolve(import.meta.dirname, "src") },
    },
    define: {
      "import.meta.env.VITE_API_URL": JSON.stringify(
        rootEnv["VITE_API_URL"] ?? "http://localhost:3001",
      ),
    },
    server: {
      port: 5173,
    },
  };
});
