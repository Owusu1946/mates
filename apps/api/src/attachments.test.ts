import { describe, expect, it } from "vitest";
import { attachmentCache, expandAttachments, resolveContentType } from "./attachments.js";

const ids = {
  photo: "00000000-0000-4000-8000-000000000001",
  pdf: "00000000-0000-4000-8000-000000000002",
  csv: "00000000-0000-4000-8000-000000000003",
  receipt: "00000000-0000-4000-8000-000000000004",
};

/** Pre-filled so expansion never reaches the database. */
function cached(...files: { id: string; name: string; contentType: string; data: string; analyzed?: boolean }[]) {
  const cache = attachmentCache();
  for (const f of files) {
    cache.meta.set(f.id, {
      id: f.id, name: f.name, contentType: f.contentType, createdAt: new Date(),
      description: f.analyzed ? `A summary of ${f.name}` : null,
      contentText: f.analyzed ? `Text read from ${f.name}` : null,
      analyzedAt: f.analyzed ? new Date() : null,
    });
    cache.data.set(f.id, Buffer.from(f.data));
  }
  return cache;
}
const types = (content: unknown) => (content as { type: string }[]).map((p) => p.type);
const texts = (content: unknown) => (content as { type: string; text?: string }[]).map((p) => p.text ?? "").join("\n");

describe("attachments", () => {
  it("trusts a known extension over a generic picker type", () => {
    expect(resolveContentType("notes.md", "application/octet-stream")).toBe("text/markdown");
    expect(resolveContentType("photo.JPG", "")).toBe("image/jpeg");
    expect(resolveContentType("invoice.pdf", "application/pdf")).toBe("application/pdf");
    expect(resolveContentType("tool.exe", "application/octet-stream")).toBeNull();
  });

  it("sends the newest turn's files in full, keeping the text", async () => {
    const cache = cached(
      { id: ids.photo, name: "photo.jpg", contentType: "image/jpeg", data: "jpg", analyzed: true },
      { id: ids.pdf, name: "invoice.pdf", contentType: "application/pdf", data: "pdf", analyzed: true },
    );
    const [message] = await expandAttachments([{ role: "user", content: "What is this?", attachments: [{ id: ids.photo }, { id: ids.pdf }] }], "user_1", cache);
    expect(types(message!.content)).toEqual(["text", "image_url", "file"]);
    expect(message).not.toHaveProperty("attachments");
  });

  it("recalls earlier files from their saved analysis instead of resending them", async () => {
    const cache = cached({ id: ids.receipt, name: "receipt.jpg", contentType: "image/jpeg", data: "jpg", analyzed: true });
    const [earlier, , latest] = await expandAttachments(
      [
        { role: "user", content: "Keep this receipt", attachments: [{ id: ids.receipt }] },
        { role: "assistant", content: "Got it." },
        { role: "user", content: "How much did I spend?" },
      ],
      "user_1",
      cache,
    );
    expect(types(earlier!.content)).toEqual(["text", "text"]);
    expect(texts(earlier!.content)).toContain("A summary of receipt.jpg");
    expect(texts(earlier!.content)).toContain(ids.receipt);
    expect(latest!.content).toBe("How much did I spend?");
  });

  it("falls back to the real file while an earlier one is still unanalyzed", async () => {
    const cache = cached({ id: ids.photo, name: "photo.jpg", contentType: "image/jpeg", data: "jpg" });
    const [earlier] = await expandAttachments(
      [{ role: "user", content: "", attachments: [{ id: ids.photo }] }, { role: "user", content: "and now?" }],
      "user_1",
      cache,
    );
    expect(types(earlier!.content)).toEqual(["image_url"]);
  });

  it("sends a re-opened file in full and inlines text files", async () => {
    const cache = cached(
      { id: ids.receipt, name: "receipt.jpg", contentType: "image/jpeg", data: "jpg", analyzed: true },
      { id: ids.csv, name: "list.csv", contentType: "text/csv", data: "a,b\n1,2", analyzed: true },
    );
    const [reopened, latest] = await expandAttachments(
      [
        { role: "user", content: "[Re-opened]", attachments: [{ id: ids.receipt }], full: true },
        { role: "user", content: "", attachments: [{ id: ids.csv }] },
      ],
      "user_1",
      cache,
    );
    expect(types(reopened!.content)).toEqual(["text", "image_url"]);
    expect(reopened).not.toHaveProperty("full");
    expect(texts(latest!.content)).toContain("a,b\n1,2");
  });
});
