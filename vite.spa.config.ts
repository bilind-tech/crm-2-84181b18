/**
 * SPA-Build für die Raspberry-Pi-Auslieferung.
 *
 * Bewusst getrennt von vite.config.ts (Lovable Cloud / TanStack Start). Diese
 * Konfig erzeugt ein klassisches Vite-SPA-Bundle, das vom Fastify-Backend auf
 * dem Pi als statische Datei ausgeliefert wird. KEIN SSR, KEIN Cloudflare
 * Worker, KEIN TanStack-Start-Server-Entry.
 *
 * Build:   bun run build:spa
 * Output:  dist-spa/{index.html, assets/*}
 */
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import path from "node:path";

export default defineConfig({
  root: path.resolve(__dirname, "pi-spa"),
  publicDir: path.resolve(__dirname, "public"),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
    dedupe: ["react", "react-dom", "@tanstack/react-router"],
  },
  plugins: [
    // Generiert routeTree.gen.ts aus src/routes — identisch zur Cloud-Preview.
    TanStackRouterVite({
      routesDirectory: path.resolve(__dirname, "src/routes"),
      generatedRouteTree: path.resolve(__dirname, "src/routeTree.gen.ts"),
      autoCodeSplitting: true,
    }),
    react(),
    tailwindcss(),
    tsconfigPaths(),
  ],
  build: {
    outDir: path.resolve(__dirname, "dist-spa"),
    emptyOutDir: true,
    sourcemap: false,
    target: "es2022",
    rollupOptions: {
      input: path.resolve(__dirname, "pi-spa/index.html"),
    },
  },
});