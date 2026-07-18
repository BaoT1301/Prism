export type AccessTokenProvider = () => Promise<string | null>;

export type ApiError = Error & { status?: number; code?: string; requestId?: string };

type ErrorBody = { error?: { code?: string; message?: string; request_id?: string }; code?: string; message?: string; request_id?: string };

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
  options: RequestInit = {},
  getAccessToken?: AccessTokenProvider,
): Promise<T> {
  const token = await getAccessToken?.();
  const response = await fetch(`${resolveApiBaseUrl()}${path}`, {
    ...options,
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  if (response.ok) return response.status === 204 ? undefined as T : response.json() as Promise<T>;
  const body = await response.json().catch(() => ({})) as ErrorBody;
  const details = body.error ?? body;
  const error = new Error(details.message ?? "The request could not be completed.") as ApiError;
  error.status = response.status;
  error.code = details.code;
  error.requestId = details.request_id;
  throw error;
}
