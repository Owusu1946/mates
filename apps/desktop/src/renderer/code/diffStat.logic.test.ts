import assert from "node:assert/strict";
import { test } from "node:test";
import { compactCount, fileTree, patchStat, totalStat } from "./diffStat.logic.ts";

test("a patch counts its added and removed lines, not its file headers", () => {
  const patch = "--- a/x.ts\n+++ b/x.ts\n@@ -1,2 +1,3 @@\n-old\n+new\n+more\n same\n";
  assert.deepEqual(patchStat("x.ts", patch), { path: "x.ts", additions: 2, deletions: 1 });
  assert.deepEqual(totalStat([{ path: "a", additions: 2, deletions: 1 }, { path: "b", additions: 3, deletions: 0 }]), { additions: 5, deletions: 1 });
});

test("counts shorten past a thousand", () => {
  assert.equal(compactCount(999), "999");
  assert.equal(compactCount(1200), "1.2k");
  assert.equal(compactCount(12_000), "12k");
  assert.equal(compactCount(1_500_000), "1.5m");
});

test("changed files become folders, with single-folder chains joined", () => {
  const tree = fileTree([
    { path: "apps/mobile/app/sign-in.tsx", additions: 4, deletions: 1 },
    { path: "apps/mobile/app/_layout.tsx", additions: 4, deletions: 0 },
    { path: "README.md", additions: 1, deletions: 0 },
  ]);
  assert.equal(tree.length, 2);
  const dir = tree[0]!;
  assert.equal(dir.kind, "dir");
  assert.equal(dir.name, "apps/mobile/app");
  assert.equal(dir.additions, 8);
  assert.deepEqual(dir.kind === "dir" && dir.children.map((child) => child.name), ["_layout.tsx", "sign-in.tsx"]);
  assert.equal(tree[1]!.name, "README.md");
});
