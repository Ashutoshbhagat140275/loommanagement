import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

// PWA and offline support are wired up in phase 3.
export default defineConfig(({ mode }) => {
  const rootEnv = loadEnv(mode, path.resolve(import.meta.dirname, "../.."), "VITE_");

  return {
    plugins: [react(), tailwindcss()],
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
