/**
 * Files you add to a message: picked, dropped or pasted. These rules decide what kind each one is
 * (for its chip), how its size reads, and which ones fit.
 */

export type AttachmentKind = "image" | "pdf" | "file";

export type Attachment = { id: string; name: string; size: number; kind: AttachmentKind; /** An object URL, for an image's thumbnail. */ preview?: string };

/** What a sent message keeps of its files. */
export type SentFile = { name: string; kind: AttachmentKind };

export const MAX_FILES = 10;
export const MAX_FILE_BYTES = 20 * 1024 * 1024;

export function kindOf(name: string, type: string): AttachmentKind {
  if (type.startsWith("image/")) return "image";
  if (type === "application/pdf" || /\.pdf$/i.test(name)) return "pdf";
  return "file";
}

/** 820 B · 14 KB · 3.2 MB */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  const mb = bytes / (1024 * 1024);
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

/**
 * Which of the new files to add: not too big, not already there (same name and size), and only as
 * many as still fit. `skipped` says why any were left out, in words.
 */
export function admitFiles<T extends { name: string; size: number }>(current: { name: string; size: number }[], incoming: T[]): { added: T[]; skipped: string | null } {
  const seen = new Set(current.map((file) => `${file.name}:${file.size}`));
  const room = MAX_FILES - current.length;
  let tooBig = 0;
  const fresh: T[] = [];
  for (const file of incoming) {
    const key = `${file.name}:${file.size}`;
    if (seen.has(key)) continue;
    if (file.size > MAX_FILE_BYTES) {
      tooBig++;
      continue;
    }
    seen.add(key);
    fresh.push(file);
  }
  const added = fresh.slice(0, Math.max(0, room));
  const overflow = fresh.length - added.length;
  const reasons = [
    tooBig > 0 && `${tooBig === 1 ? "1 file is" : `${tooBig} files are`} over ${formatBytes(MAX_FILE_BYTES)}`,
    overflow > 0 && `up to ${MAX_FILES} files a message`,
  ].filter(Boolean);
  return { added, skipped: reasons.length ? `Not added: ${reasons.join(", and ")}.` : null };
}
