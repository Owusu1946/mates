import { ExtensionStorage } from "@bacons/apple-targets";
import { Platform } from "react-native";
import { env } from "../env";

const APP_GROUP = "group.app.askorin.mates";
const MATES_KEY = "share.mates.v1";
const LAST_MATE_KEY = "share.last-mate.v1";
const CLERK_PUBLISHABLE_KEY = "share.clerk-publishable-key.v1";

type ShareMate = { id: string; name: string; chatId: string };

const storage = new ExtensionStorage(APP_GROUP);

/** Writes only the mate fields the iOS share extension needs. */
export function writeShareMates(userId: string, mates: ShareMate[]) {
  if (Platform.OS !== "ios") return;
  try {
    storage.set(CLERK_PUBLISHABLE_KEY, env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY);
    storage.set(MATES_KEY, JSON.stringify({ version: 1, userId, mates, updatedAt: Date.now() }));
  } catch (error) {
    console.warn("share_mates_cache_write_failed", error);
  }
}

/** Remove account-specific data from the shared container after sign-out. */
export function clearShareContext() {
  if (Platform.OS !== "ios") return;
  try {
    storage.remove(MATES_KEY);
    storage.remove(LAST_MATE_KEY);
    storage.remove(CLERK_PUBLISHABLE_KEY);
  } catch (error) {
    console.warn("share_context_clear_failed", error);
  }
}
