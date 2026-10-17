import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/answer": "http://127.0.0.1:8787",
      "/sources": "http://127.0.0.1:8787",
      "/samples": "http://127.0.0.1:8787",
      "/eval": "http://127.0.0.1:8787",
      "/health": "http://127.0.0.1:8787",
      "/verify": "http://127.0.0.1:8787",
      "/last-verify": "http://127.0.0.1:8787",
    },
  },
});
