import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  build: {
    rollupOptions: {
      input: {
        app: "index.html",
        sandboxDemo: "sandbox-demo.html",
      },
    },
  },
});
