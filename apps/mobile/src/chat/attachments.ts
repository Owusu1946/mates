import { File } from "expo-file-system";
import { fetch } from "expo/fetch";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { resolveApiUrl } from "./chat-model";

/** Mirrors the API limit; checked here so a too-large file fails before it uploads. */
export const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024;
export const MAX_ATTACHMENTS = 4;
/** Sharp enough for the model to read text in a photo, small enough to upload in about a second. */
const MAX_IMAGE_EDGE = 1600;

export const DOCUMENT_TYPES = ["application/pdf", "text/plain", "text/csv", "text/markdown", "application/json", "text/*"];

export type UploadSource = { uri: string; name: string; contentType: string; size?: number | null };
export type UploadedAttachment = { id: string; name: string; contentType: string; size: number };

/** On-device copies of uploaded images, so the sender's own photos never wait on a download. */
const previews = new Map<string, string>();
export const localPreview = (id: string) => previews.get(id);

export function attachmentUrl(id: string) {
  const base = resolveApiUrl();
  return base ? `${base}/v1/attachments/${id}` : null;
}

/** Downscales and re-encodes as JPEG: shrinks camera photos ~10x and turns HEIC into a type models read. */
export async function prepareImage(uri: string): Promise<UploadSource> {
  const source = await ImageManipulator.manipulate(uri).renderAsync();
  const resized =
    Math.max(source.width, source.height) > MAX_IMAGE_EDGE
      ? await ImageManipulator.manipulate(source)
          .resize(source.width >= source.height ? { width: MAX_IMAGE_EDGE } : { height: MAX_IMAGE_EDGE })
          .renderAsync()
      : source;
  const saved = await resized.saveAsync({ format: SaveFormat.JPEG, compress: 0.7 });
  return { uri: saved.uri, name: `photo_${Date.now()}.jpg`, contentType: "image/jpeg" };
}

export async function uploadAttachment(source: UploadSource, getToken: () => Promise<string | null>): Promise<UploadedAttachment> {
  const base = resolveApiUrl();
  const token = await getToken();
  if (!token || !base) throw new Error("Sign in and reconnect to attach files.");
  const file = new File(source.uri);
  if (!file.exists) throw new Error("That file is no longer available.");
  if ((source.size ?? file.size ?? 0) > MAX_ATTACHMENT_BYTES) throw new Error("Files must be 4 MB or smaller.");
  const form = new FormData();
  form.append("file", file as unknown as Blob, source.name);
  const response = await fetch(`${base}/v1/attachments`, { method: "POST", headers: { authorization: `Bearer ${token}` }, body: form });
  const payload = (await response.json().catch(() => null)) as { attachment?: UploadedAttachment; error?: { message?: string } } | null;
  if (!response.ok || !payload?.attachment) throw new Error(payload?.error?.message ?? "Couldn’t attach that file. Try again.");
  if (payload.attachment.contentType.startsWith("image/")) previews.set(payload.attachment.id, source.uri);
  return payload.attachment;
}
