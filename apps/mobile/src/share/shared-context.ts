import { ExtensionStorage } from "@bacons/apple-targets";
import { File } from "expo-file-system";
import { Platform } from "react-native";
import { env } from "../env";

const APP_GROUP = "group.app.askorin.mates";
const MATES_KEY = "share.mates.v1";
const LAST_MATE_KEY = "share.last-mate.v1";
const CLERK_PUBLISHABLE_KEY = "share.clerk-publishable-key.v1";
const API_BASE_URL_KEY = "share.api-base-url.v1";
const PENDING_KEY = "share.pending.v1";

type ShareMate = { id: string; name: string; chatId: string };

const storage = new ExtensionStorage(APP_GROUP);

/** Writes only the mate fields the iOS share extension needs. */
export function writeShareMates(userId: string, mates: ShareMate[]) {
  if (Platform.OS !== "ios") return;
  try {
    storage.set(CLERK_PUBLISHABLE_KEY, env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY);
    if (env.EXPO_PUBLIC_API_URL) storage.set(API_BASE_URL_KEY, env.EXPO_PUBLIC_API_URL.replace(/\/$/, ""));
    else storage.remove(API_BASE_URL_KEY);
    storage.set(MATES_KEY, JSON.stringify({ version: 1, userId, mates, updatedAt: Date.now() }));
  } catch (error) {
    console.warn("share_mates_cache_write_failed", error);
  }
}

/** Remove account-specific data from the shared container after sign-out. */
export function clearShareContext() {
  if (Platform.OS !== "ios") return;
  try {
    const pending = storage.get(PENDING_KEY);
    if (typeof pending === "string") {
      try {
        const path = (JSON.parse(pending) as { filePath?: unknown }).filePath;
        if (typeof path === "string") new File(`file://${path}`).delete();
      } catch { /* A malformed entry must not prevent sign-out cleanup. */ }
    }
    storage.remove(PENDING_KEY);
    storage.remove(MATES_KEY);
    storage.remove(LAST_MATE_KEY);
    storage.remove(CLERK_PUBLISHABLE_KEY);
    storage.remove(API_BASE_URL_KEY);
  } catch (error) {
    console.warn("share_context_clear_failed", error);
  }
}
