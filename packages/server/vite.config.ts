import { defineConfig } from "vite";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  root: resolve(__dirname, "ui"),
  build: {
    outDir: resolve(__dirname, "dist/ui"),
    rollupOptions: {
      input: "index.html",
    },
  },

  server: {
    proxy: {
      "/api": "http://localhost:3000",
    },
  },
  // Vite Plus needs this to treat index.html as entry
  publicDir: false,
  // Explicitly set base to empty to avoid path resolution issues
  base: "./",
});
