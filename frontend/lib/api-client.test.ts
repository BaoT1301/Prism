import { describe, expect, it } from "vitest";

import { resolveApiBaseUrl } from "./api-client";

describe("resolveApiBaseUrl", () => {
  it("uses the same-origin Vercel API proxy for Vercel deployments", () => {
    expect(resolveApiBaseUrl("prism-gray-gamma.vercel.app")).toBe("/api");
    expect(resolveApiBaseUrl("prism-git-main-team.vercel.app")).toBe("/api");
  });

  it("keeps the configured API base URL for local development", () => {
    expect(resolveApiBaseUrl("localhost", "http://localhost:8000")).toBe("http://localhost:8000");
  });
});
