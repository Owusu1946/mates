import { useAuth } from "@clerk/electron/react";
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

/** The body of a successful response, or the API's own message (failure() in app.ts) as an Error. */
export async function read<T>(response: { ok: boolean; json(): Promise<unknown> }, fallback: string): Promise<T> {
  const body = (await response.json().catch(() => null)) as (T & { error?: { message?: string } }) | null;
  if (!response.ok || !body) throw new Error(body?.error?.message ?? fallback);
  return body;
}
