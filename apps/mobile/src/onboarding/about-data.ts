import { useAuth } from "@clerk/expo";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { createApiClient } from "../data/api";

/** What the user told their lead mate about themselves ("About you"). */
export type About = { bio: string; updatedAt: string | null };

export const MAX_BIO_CHARS = 4_000;

export function useAbout() {
  const { getToken, userId } = useAuth();
  const api = useMemo(() => createApiClient(getToken), [getToken]);
  return useQuery({
    queryKey: ["about", userId],
    queryFn: async () => {
      const response = await api.v1.about.$get();
      if (!response.ok) throw new Error("Couldn’t load what you shared.");
      return (await response.json()) as About;
    },
  });
}

/**
 * Saves the bio. The mates turn it into memories in the background; with `wait` (onboarding) the
 * server holds the reply for up to ~20s so the lead's welcome is in its chat when it opens.
 * `forgetLearned` also removes the memories that came from the bio.
 */
export function useSaveAbout() {
  const { getToken, userId } = useAuth();
  const api = useMemo(() => createApiClient(getToken), [getToken]);
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: { bio: string; wait?: boolean; forgetLearned?: boolean }) => {
      const response = await api.v1.about.$put({ json: input });
      if (!response.ok) throw new Error("Couldn’t save that. Check your connection and try again.");
      return (await response.json()) as About;
    },
    onSuccess: (about) => {
      client.setQueryData(["about", userId], about);
      // The memories it produces arrive a few seconds later; the Memory screen refetches on open.
      void client.invalidateQueries({ queryKey: ["memories"] });
      void client.invalidateQueries({ queryKey: ["chats"] });
    },
  });
}
