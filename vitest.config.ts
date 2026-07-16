import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["frontend/**/*.test.ts", "frontend/**/*.test.tsx"],
  },
});
