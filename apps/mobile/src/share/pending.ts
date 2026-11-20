import { ExtensionStorage } from "@bacons/apple-targets";
import { File } from "expo-file-system";
import { Platform } from "react-native";
import { uploadAttachment } from "../chat/attachments";
import { runRequest } from "../chat/background-chat";

const storage = new ExtensionStorage("group.app.askorin.mates");
const PENDING_KEY = "share.pending.v1";
const LAST_MATE_KEY = "share.last-mate.v1";

export type PendingShare = {
  id: string;
  userId: string;
  mateId: string;
  chatId: string;
  note: string;
  link: string | null;
  filePath: string | null;
  fileName: string | null;
  contentType: string | null;
  uploadedId: string | null;
};

export function readPendingShare(userId: string): PendingShare | null {
  if (Platform.OS !== "ios") return null;
  try {
    const value = storage.get(PENDING_KEY);
    if (typeof value !== "string") return null;
    const share = JSON.parse(value) as PendingShare;
    if (share.userId !== userId || !/^[a-f0-9-]{36}$/i.test(share.id) || typeof share.chatId !== "string") return null;
    return share;
  } catch {
    return null;
  }
}

function savePendingShare(share: PendingShare) {
  storage.set(PENDING_KEY, JSON.stringify(share));
}

export function discardPendingShare(share: PendingShare) {
  if (readPendingShare(share.userId)?.id !== share.id) return;
  storage.remove(PENDING_KEY);
  if (share.filePath) {
    try { new File(`file://${share.filePath}`).delete(); } catch { /* The file may already be gone. */ }
  }
}

/** Reuses any completed upload and the original run key after an ambiguous send failure. */
export async function sendPendingShare(share: PendingShare, getToken: () => Promise<string | null>) {
  const current = readPendingShare(share.userId);
  if (current?.id !== share.id) throw new Error("This share is no longer pending.");
  let uploadedId = current.uploadedId;
  if (current.filePath && !uploadedId) {
    if (!current.fileName || !current.contentType) throw new Error("The shared file is no longer available.");
    const uploaded = await uploadAttachment({
      uri: `file://${current.filePath}`,
      name: current.fileName,
      contentType: current.contentType,
    }, getToken);
    uploadedId = uploaded.id;
    savePendingShare({ ...current, uploadedId });
  }
  const content = [current.note, current.link ?? ""].filter(Boolean).join("\n\n");
  const { runId } = await runRequest<{ runId: string }>(getToken, "runs", {
    chatId: current.chatId,
    requestKey: `share_${current.id}`,
    assistantMessageId: `assistant_share_${current.id}`,
    parentId: `user_share_${current.id}`,
    messages: [{ role: "user", content, ...(uploadedId ? { attachments: [{ id: uploadedId }] } : {}) }],
  });
  if (!runId) throw new Error("Mates could not confirm the send. Try again.");
  storage.set(LAST_MATE_KEY, current.mateId);
  discardPendingShare(current);
  return current.chatId;
}
