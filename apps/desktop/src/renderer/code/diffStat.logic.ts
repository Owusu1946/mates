/**
 * Counting a change: +/− per file from its patch, the changed files as a folder tree, and short
 * counts (T3 Code's DiffStatLabel and lib/turnDiffTree).
 */

export type FileStat = { path: string; additions: number; deletions: number };

export type TreeNode =
  | { kind: "dir"; name: string; path: string; additions: number; deletions: number; children: TreeNode[] }
  | { kind: "file"; name: string; path: string; additions: number; deletions: number };

/** Added and removed lines in a unified patch, leaving out the file header lines. */
export function patchStat(path: string, patch: string): FileStat {
  let additions = 0;
  let deletions = 0;
  for (const line of patch.split("\n")) {
    if (line.startsWith("+++") || line.startsWith("---")) continue;
    if (line.startsWith("+")) additions++;
    else if (line.startsWith("-")) deletions++;
  }
  return { path, additions, deletions };
}

export function totalStat(files: FileStat[]): { additions: number; deletions: number } {
  return files.reduce((sum, file) => ({ additions: sum.additions + file.additions, deletions: sum.deletions + file.deletions }), { additions: 0, deletions: 0 });
}

/** 999 · 1.2k · 12k · 1.5m */
export function compactCount(value: number): string {
  if (value < 1000) return String(value);
  const short = (n: number, unit: string) => `${n < 10 ? n.toFixed(1).replace(/\.0$/, "") : Math.round(n)}${unit}`;
  if (value < 999_500) return short(value / 1000, "k");
  return short(value / 1_000_000, "m");
}

type Dir = { dirs: Map<string, Dir>; files: FileStat[] };

/**
 * The files as folders, sorted folders first, with single-folder chains joined into one row
 * ("apps/mobile/app") so a deep path doesn't cost a row per level.
 */
export function fileTree(files: FileStat[]): TreeNode[] {
  const root: Dir = { dirs: new Map(), files: [] };
  for (const file of files) {
    const parts = file.path.split("/");
    let dir = root;
    for (const part of parts.slice(0, -1)) {
      if (!dir.dirs.has(part)) dir.dirs.set(part, { dirs: new Map(), files: [] });
      dir = dir.dirs.get(part)!;
    }
    dir.files.push(file);
  }

  const build = (dir: Dir, prefix: string): TreeNode[] => {
    const dirs = [...dir.dirs.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, child]): TreeNode => {
        let label = name;
        let current = child;
        // Join a folder with its only child folder while it holds no files of its own.
        while (current.files.length === 0 && current.dirs.size === 1) {
          const [nextName, next] = [...current.dirs.entries()][0]!;
          label = `${label}/${nextName}`;
          current = next;
        }
        const path = prefix ? `${prefix}/${label}` : label;
        const children = build(current, path);
        return { kind: "dir", name: label, path, children, ...totalStat(children) };
      });
    const leaves = [...dir.files]
      .sort((a, b) => a.path.localeCompare(b.path))
      .map((file): TreeNode => ({ kind: "file", name: file.path.split("/").at(-1)!, path: file.path, additions: file.additions, deletions: file.deletions }));
    return [...dirs, ...leaves];
  };

  return build(root, "");
}
