import AsyncStorage from "@react-native-async-storage/async-storage";
import { File } from "expo-file-system";
import { uploadAttachment } from "../chat/attachments";
import { submitShareRun, type PendingShare } from "./pending";

const pendingKey = (userId: string) => `share.pending.v1:${userId}`;
const lastMateKey = (userId: string) => `share.last-mate.v1:${userId}`;

export async function readAndroidPendingShare(userId: string): Promise<PendingShare | null> {
  try {
    const value = await AsyncStorage.getItem(pendingKey(userId));
    if (!value) return null;
    const share = JSON.parse(value) as PendingShare;
    if (share.userId !== userId || !/^[a-f0-9-]{36}$/i.test(share.id) || typeof share.chatId !== "string") return null;
    return share;
  } catch {
    return null;
  }
}

export async function saveAndroidPendingShare(share: PendingShare) {
  await AsyncStorage.setItem(pendingKey(share.userId), JSON.stringify(share));
}

export async function readAndroidLastMate(userId: string) {
  return AsyncStorage.getItem(lastMateKey(userId));
}

export async function discardAndroidPendingShare(share: PendingShare) {
  if ((await readAndroidPendingShare(share.userId))?.id !== share.id) return;
  await AsyncStorage.removeItem(pendingKey(share.userId));
  if (share.filePath) {
    try { new File(share.filePath).delete(); } catch { /* The staged file may already be gone. */ }
  }
}

export async function clearAndroidShareContext(userId: string) {
  try {
    const share = await readAndroidPendingShare(userId);
    if (share) await discardAndroidPendingShare(share);
    await AsyncStorage.removeItem(lastMateKey(userId));
  } catch (error) {
    console.warn("android_share_context_clear_failed", error);
  }
}

export async function sendAndroidPendingShare(share: PendingShare, getToken: () => Promise<string | null>) {
  const current = await readAndroidPendingShare(share.userId);
  if (current?.id !== share.id) throw new Error("This share is no longer pending.");
  let uploadedId = current.uploadedId ?? undefined;
  if (current.filePath && !uploadedId) {
    if (!current.fileName || !current.contentType) throw new Error("The shared file is no longer available.");
    const uploaded = await uploadAttachment({ uri: current.filePath, name: current.fileName, contentType: current.contentType }, getToken);
    uploadedId = uploaded.id;
    await saveAndroidPendingShare({ ...current, uploadedId });
  }
  const chatId = await submitShareRun(current, uploadedId, getToken);
  await AsyncStorage.setItem(lastMateKey(current.userId), current.mateId);
  await discardAndroidPendingShare(current);
  return chatId;
}
