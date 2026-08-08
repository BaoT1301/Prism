import { afterEach, describe, expect, it, vi } from "vitest";

import { apiRequest, ApiError, resolveApiBaseUrl } from "./api-client";

describe("resolveApiBaseUrl", () => {
  it("uses the same-origin Vercel API proxy for Vercel deployments", () => {
    expect(resolveApiBaseUrl("prism-gray-gamma.vercel.app")).toBe("/api");
    expect(resolveApiBaseUrl("prism-git-main-team.vercel.app")).toBe("/api");
  });

  it("keeps the configured API base URL for local development", () => {
    expect(resolveApiBaseUrl("localhost", "http://localhost:8000")).toBe("http://localhost:8000");
  });
});

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

describe("apiRequest", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("parses JSON on success and forwards auth + content-type headers", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await apiRequest<{ ok: boolean }>("/api/v1/thing", { method: "POST", body: JSON.stringify({ a: 1 }) }, async () => "tok");

    expect(result).toEqual({ ok: true });
    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer tok");
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("returns undefined for a 204 No Content response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    await expect(apiRequest("/api/v1/thing", { method: "DELETE" })).resolves.toBeUndefined();
  });

  it("maps a nested error body to ApiError fields", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ error: { code: "BAD", message: "Nope", request_id: "req-1" } }, { status: 400 })));
    const error = await apiRequest("/api/v1/thing").catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 400, code: "BAD", message: "Nope", requestId: "req-1", isAuthError: false });
  });

  it("maps a flat error body and marks 401 as an auth error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ code: "AUTH", message: "Expired" }, { status: 401 })));
    const error = await apiRequest("/api/v1/me").catch((reason: unknown) => reason as ApiError);
    expect(error).toMatchObject({ status: 401, code: "AUTH", isAuthError: true });
  });

  it("falls back to the X-Request-ID header when the body omits it", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ error: { message: "Boom" } }, { status: 500, headers: { "X-Request-ID": "hdr-9" } })));
    const error = (await apiRequest("/api/v1/thing", { retries: 0 }).catch((reason: unknown) => reason)) as ApiError;
    expect(error.requestId).toBe("hdr-9");
  });

  it("retries an idempotent GET on a retryable status then succeeds", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ error: { message: "flaky" } }, { status: 503 }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await apiRequest<{ ok: boolean }>("/api/v1/thing", { retryDelayMs: 0 });
    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry a non-idempotent POST", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: { message: "server" } }, { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiRequest("/api/v1/thing", { method: "POST", retryDelayMs: 0 })).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
