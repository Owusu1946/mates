import { useAuth } from "../auth/account.ts";
import type { AppType } from "@expojet/api-contract";
import { hc } from "hono/client";

/**
 * The typed API client, as on the phone (apps/mobile/src/data/api.ts): every request carries the
 * signed-in person's Clerk session token, which the API's auth middleware checks.
 */
export function createApiClient(getToken: () => Promise<string | null>) {
  const apiUrl = import.meta.env.VITE_API_URL;
  if (!apiUrl) throw new Error("Set VITE_API_URL in apps/desktop/.env to connect to the API.");
  return hc<AppType>(apiUrl, {
    fetch: async (input: string | Request | URL, init?: RequestInit) => {
      const token = await getToken();
      const headers = new Headers(init?.headers);
      if (token) headers.set("authorization", `Bearer ${token}`);
      return fetch(input, { ...init, headers });
    },
  });
}

export type ApiClient = ReturnType<typeof createApiClient>;

export function useApi(): ApiClient {
  const { getToken } = useAuth();
  return createApiClient(() => getToken());
}

export type GetToken = () => Promise<string | null>;

/**
 * A plain request to the API with the session token, for what the typed client doesn't do well:
 * reading a streamed response body (run events) and its headers (x-run-id).
 */
export async function apiFetch(getToken: GetToken, path: string, init: RequestInit = {}): Promise<Response> {
  const apiUrl = import.meta.env.VITE_API_URL;
  if (!apiUrl) throw new Error("Set VITE_API_URL in apps/desktop/.env to connect to the API.");
  const token = await getToken();
  if (!token) throw new Error("Your session ended. Sign in again to continue.");
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${token}`);
  return fetch(`${apiUrl.replace(/\/$/, "")}${path}`, { ...init, headers });
}

/** The API's refusal, with its code, so callers can tell "out of usage" from a failure. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

/** Throws the API's own message and code when a plain request was refused. */
export async function ensureOk(response: Response, fallback: string): Promise<Response> {
  if (response.ok) return response;
  const body = (await response.json().catch(() => null)) as { error?: { message?: string; code?: string } } | null;
  throw new ApiError(body?.error?.message ?? fallback, response.status, body?.error?.code ?? "unknown");
}

/** The body of a successful response, or the API's own message (failure() in app.ts) as an Error. */
export async function read<T>(response: { ok: boolean; json(): Promise<unknown> }, fallback: string): Promise<T> {
  const body = (await response.json().catch(() => null)) as (T & { error?: { message?: string } }) | null;
  if (!response.ok || !body) throw new Error(body?.error?.message ?? fallback);
  return body;
}
