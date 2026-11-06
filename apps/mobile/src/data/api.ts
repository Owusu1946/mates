import type { AppType } from "@expojet/api-contract";
import { hc } from "hono/client";
import { fetch } from "expo/fetch";
import { resolveApiUrl } from "../chat/chat-model";

export function createApiClient(getToken: () => Promise<string | null>) {
  const apiUrl = resolveApiUrl();
  if (!apiUrl)
    throw new Error(
      "Set EXPO_PUBLIC_API_URL in apps/mobile/.env to connect to the API.",
    );
  return hc<AppType>(apiUrl, {
    fetch: async (input: string | Request | URL, init?: RequestInit) => {
      const token = await getToken();
      const headers = new Headers(init?.headers);
      if (token) headers.set("authorization", "Bearer " + token);
      return fetch(input instanceof URL ? input.toString() : input, {
        ...init,
        headers,
      });
    },
  });
}
