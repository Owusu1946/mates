import { ExtensionStorage } from "@bacons/apple-targets";
import { File } from "expo-file-system";
import { Platform } from "react-native";
import { uploadAttachment } from "../chat/attachments";
import { runRequest } from "../chat/background-chat";
import { createApiClient } from "../data/api";

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
  state?: "sending" | "failed";
  startedAt?: number;
  locked?: boolean;
};

/** A dead extension cannot mark failure; allow recovery after ten minutes. */
export function canRetryPendingShare(share: PendingShare) {
  return share.state !== "sending" || (typeof share.startedAt === "number" && Date.now() / 1000 - share.startedAt > 600);
}

const storage = Platform.OS === "ios" ? new ExtensionStorage("group.app.askorin.mates") : null;

export function readPendingShare(userId: string): PendingShare | null {
  if (!storage) return null;
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
  storage?.set(PENDING_KEY, JSON.stringify(share));
}

/** Attach a share turn to the current conversation before submitRun creates its assistant row. */
async function saveShareMessage(share: PendingShare, uploadedId: string | undefined, getToken: () => Promise<string | null>) {
  const api = createApiClient(getToken);
  const response = await api.v1.chats[":id"].messages.$get({ param: { id: share.chatId }, query: {} });
  if (!response.ok) throw new Error("Couldn’t load this chat before sharing. Try again.");
  const { messages } = await response.json();
  const messageId = `user_share_${share.id}`;
  if (messages.some((item) => item.message.id === messageId)) return;

  const parents = new Set(messages.flatMap((item) => item.parentId ? [item.parentId] : []));
  const candidate = messages.filter((item) => typeof item.message.id === "string" && !parents.has(item.message.id)).at(-1)?.message.id;
  const head = typeof candidate === "string" ? candidate : null;
  const content = [share.note, share.link ?? ""].filter(Boolean).join("\n\n");
  const message = {
    id: messageId,
    role: "user" as const,
    createdAt: new Date().toISOString(),
    content: content ? [{ type: "text", text: content }] : [],
    ...(uploadedId && share.fileName ? {
      attachments: [{ id: uploadedId, name: share.fileName, type: share.contentType?.startsWith("image/") ? "image" : "file" }],
    } : {}),
  };
  const saved = await api.v1.chats[":id"].messages.$put(
    { param: { id: share.chatId } },
    { init: { body: JSON.stringify({ parentId: head, message }), headers: { "content-type": "application/json" } } },
  );
  if (!saved.ok) throw new Error("Couldn’t add this share to the chat. Try again.");
}

/** Save the shared user turn and submit it through the same run contract on every platform. */
export async function submitShareRun(share: PendingShare, uploadedId: string | undefined, getToken: () => Promise<string | null>) {
  const content = [share.note, share.link ?? ""].filter(Boolean).join("\n\n");
  await saveShareMessage(share, uploadedId, getToken);
  const { runId } = await runRequest<{ runId: string }>(getToken, "runs", {
    chatId: share.chatId,
    requestKey: `share_${share.id}`,
    assistantMessageId: `assistant_share_${share.id}`,
    parentId: `user_share_${share.id}`,
    messages: [{ role: "user", content, ...(uploadedId ? { attachments: [{ id: uploadedId }] } : {}) }],
  });
  if (!runId) throw new Error("Mates could not confirm the send. Try again.");
  return share.chatId;
}

export function discardPendingShare(share: PendingShare) {
  if (!canRetryPendingShare(share)) return;
  if (readPendingShare(share.userId)?.id !== share.id) return;
  storage?.remove(PENDING_KEY);
  if (share.filePath) {
    try { new File(`file://${share.filePath}`).delete(); } catch { /* The file may already be gone. */ }
  }
}

/** Reuses any completed upload and the original run key after an ambiguous send failure. */
export async function sendPendingShare(share: PendingShare, getToken: () => Promise<string | null>) {
  const current = readPendingShare(share.userId);
  if (current?.id !== share.id) throw new Error("This share is no longer pending.");
  if (!canRetryPendingShare(current)) throw new Error("This share is still sending. Open Mates again if it does not finish.");
  let uploadedId = current.uploadedId ?? undefined;
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
  await submitShareRun(current, uploadedId, getToken);
  storage?.set(LAST_MATE_KEY, current.mateId);
  discardPendingShare(current);
  return current.chatId;
}
