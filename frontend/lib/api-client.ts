export type AccessTokenProvider = () => Promise<string | null>;

export type ApiError = Error & { status?: number; code?: string; requestId?: string };

type ErrorBody = { error?: { code?: string; message?: string; request_id?: string }; code?: string; message?: string; request_id?: string };

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
  getAccessToken?: AccessTokenProvider,
): Promise<T> {
  const token = await getAccessToken?.();
  const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
  const response = await fetch(`${env?.VITE_API_BASE_URL ?? ""}${path}`, {
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
