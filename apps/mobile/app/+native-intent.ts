export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  try {
    if (new URL(path).hostname === "expo-sharing") return "/(app)/share-receive";
  } catch {
    // Keep malformed or app-owned paths on their normal Router path.
  }
  return path;
}
