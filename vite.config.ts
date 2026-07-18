import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // Clerk's authorized-party check uses the full browser origin. Failing rather
  // than silently moving to 5174 keeps the documented local setup trustworthy.
  server: { port: 5173, strictPort: true },
  build: {
    rollupOptions: {
      input: {
        app: "index.html",
        sandboxDemo: "sandbox-demo.html",
      },
    },
  },
});
