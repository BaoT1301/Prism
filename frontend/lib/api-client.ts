export type AccessTokenProvider = () => Promise<string | null>;

/**
 * Single error type for the whole app. Both the REST helpers here and the
 * sandbox API layer throw `ApiError`, so callers only ever branch on one shape
 * (`status` / `code` / `requestId` / `isAuthError`).
 */
export class ApiError extends Error {
  status?: number;
  code?: string;
  requestId?: string;
  /** True for 401 responses so callers can trigger re-auth instead of showing a generic error. */
  isAuthError: boolean;

  constructor(message: string, options: { status?: number; code?: string; requestId?: string } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = options.status;
    this.code = options.code;
    this.requestId = options.requestId;
    this.isAuthError = options.status === 401;
  }
}

type ErrorBody = { error?: { code?: string; message?: string; request_id?: string }; code?: string; message?: string; request_id?: string };

export interface ApiRequestOptions extends RequestInit {
  /** Override the automatic retry count (idempotent GET/HEAD default to 2, others to 0). */
  retries?: number;
  /** Base backoff delay in milliseconds (doubles each attempt). */
  retryDelayMs?: number;
}

const IDEMPOTENT_METHODS = new Set(["GET", "HEAD"]);
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

export function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { name?: string }).name === "AbortError";
}

function delay(ms: number, signal?: AbortSignal | null): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("Aborted", "AbortError"));
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export function resolveApiBaseUrl(
  hostname = typeof window === "undefined" ? "" : window.location.hostname,
  configuredBaseUrl?: string,
): string {
  const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
  // Vercel rewrites this same-origin prefix to Railway. Keeping browser requests
  // same-origin removes CORS from the student assignment launch path.
  return hostname.endsWith(".vercel.app") ? "/api" : configuredBaseUrl ?? env?.VITE_API_BASE_URL ?? "";
}

export async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions = {},
  getAccessToken?: AccessTokenProvider,
): Promise<T> {
  const { retries, retryDelayMs, ...init } = options;
  const method = (init.method ?? "GET").toUpperCase();
  const maxRetries = retries ?? (IDEMPOTENT_METHODS.has(method) ? 2 : 0);
  const baseDelay = retryDelayMs ?? 150;

  for (let attempt = 0; ; attempt++) {
    try {
      const token = await getAccessToken?.();
      const response = await fetch(`${resolveApiBaseUrl()}${path}`, {
        ...init,
        headers: {
          Accept: "application/json",
          ...(init.body ? { "Content-Type": "application/json" } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...init.headers,
        },
      });
      if (response.ok) return response.status === 204 ? (undefined as T) : ((await response.json()) as T);

      if (RETRYABLE_STATUS.has(response.status) && attempt < maxRetries) {
        await delay(baseDelay * 2 ** attempt, init.signal);
        continue;
      }
      const body = (await response.json().catch(() => ({}))) as ErrorBody;
      const details = body.error ?? body;
      throw new ApiError(details.message ?? "The request could not be completed.", {
        status: response.status,
        code: details.code,
        requestId: details.request_id ?? response.headers.get("X-Request-ID") ?? undefined,
      });
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (isAbortError(error)) throw error;
      // Network-level failure (fetch rejects). Retry idempotent requests, otherwise surface it.
      if (attempt < maxRetries) {
        await delay(baseDelay * 2 ** attempt, init.signal);
        continue;
      }
      throw new ApiError(error instanceof Error ? error.message : "Network request failed.", { code: "NETWORK_ERROR" });
    }
  }
}
