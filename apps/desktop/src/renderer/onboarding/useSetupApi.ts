import { read, useApi } from "../lib/api.ts";
import type { Leader } from "./LeaderScreen.tsx";
import type { ImportSource } from "./MemoryImport.logic.ts";

/** One fact the API found in another assistant's answer (POST /v1/memories/import). */
export type ImportItem = {
  key: string;
  text: string;
  category: string;
  importance: number;
  sensitive?: boolean;
  /** A memory it would replace; ticking it means "use the new one". */
  conflict: { id: string; text: string } | null;
};

/**
 * What setting up saves, through the same routes the phone uses: the lead mate's name and look
 * (which marks it set up), your name and introduction, and the memories you bring. Each throws
 * the API's own message when it fails, for the screen to show with a retry.
 */
export function useSetupApi() {
  const api = useApi();
  return {
    async saveLeader(leader: Leader) {
      await read(await api.v1.leader.$post({ json: leader }), "Couldn’t save your mate. Try again.");
    },
    async saveAbout(name: string, bio: string) {
      if (name) await read(await api.v1.profile.name.$put({ json: { name } }), "Couldn’t save your name. Try again.");
      // wait: the lead mate's welcome is ready when the chat opens (about.ts).
      if (bio) await read(await api.v1.about.$put({ json: { bio, wait: true } }), "Couldn’t save that. Try again.");
    },
    async previewImport(source: ImportSource, text: string) {
      const body = await read<{ items: ImportItem[] }>(await api.v1.memories.import.$post({ json: { source, text } }), "Couldn’t read that. Try again.");
      return body.items;
    },
    async confirmImport(source: ImportSource, items: ImportItem[]) {
      const json = {
        source,
        items: items.map((item) => ({ text: item.text, category: item.category as never, importance: item.importance, ...(item.conflict ? { replaces: item.conflict.id } : {}) })),
      };
      const body = await read<{ imported: number }>(await api.v1.memories.import.confirm.$post({ json }), "Couldn’t import. Try again.");
      return body.imported;
    },
  };
}

/** The message of whatever a save threw. */
export const messageOf = (error: unknown) => (error instanceof Error ? error.message : "Something went wrong. Please try again.");
