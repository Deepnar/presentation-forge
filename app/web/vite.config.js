import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // Vite resolves `root` against the cwd, not the config file, and we run it
  // from the project root so the CLI and API share one node_modules.
  root: here,
  plugins: [react(), tailwind()],
  server: {
    port: 5173,
    // The API runs as a separate process so the CLI and the UI share one
    // implementation; proxying keeps the browser on a single origin.
    proxy: {
      "/api": { target: "http://localhost:5174", changeOrigin: true },
    },
  },
});
