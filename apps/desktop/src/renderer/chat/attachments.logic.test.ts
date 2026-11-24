import assert from "node:assert/strict";
import { test } from "node:test";
import { admitFiles, formatBytes, kindOf, MAX_FILE_BYTES, MAX_FILES } from "./attachments.logic.ts";

test("images, PDFs and everything else get their own chip", () => {
  assert.equal(kindOf("photo.HEIC", "image/heic"), "image");
  assert.equal(kindOf("Statement.PDF", ""), "pdf");
  assert.equal(kindOf("notes.txt", "text/plain"), "file");
});

test("sizes read short", () => {
  assert.equal(formatBytes(820), "820 B");
  assert.equal(formatBytes(14 * 1024), "14 KB");
  assert.equal(formatBytes(3.24 * 1024 * 1024), "3.2 MB");
  assert.equal(formatBytes(15 * 1024 * 1024), "15 MB");
});

test("duplicates are dropped quietly; too big and too many say why", () => {
  const current = [{ name: "a.png", size: 10 }];
  assert.deepEqual(admitFiles(current, [{ name: "a.png", size: 10 }, { name: "b.png", size: 20 }]), { added: [{ name: "b.png", size: 20 }], skipped: null });

  const big = admitFiles([], [{ name: "huge.mov", size: MAX_FILE_BYTES + 1 }]);
  assert.deepEqual(big.added, []);
  assert.equal(big.skipped, "Not added: 1 file is over 20 MB.");

  const full = Array.from({ length: MAX_FILES - 1 }, (_, index) => ({ name: `f${index}`, size: 1 }));
  const over = admitFiles(full, [{ name: "x", size: 1 }, { name: "y", size: 1 }]);
  assert.deepEqual(over.added.map((file) => file.name), ["x"]);
  assert.equal(over.skipped, `Not added: up to ${MAX_FILES} files a message.`);
});
