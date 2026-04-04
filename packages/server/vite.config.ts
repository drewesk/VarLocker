import { defineConfig } from "vite";
import { resolve } from "path";

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
