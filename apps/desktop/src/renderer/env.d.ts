/** What the preload puts on window (src/preload/index.ts). */
interface Window {
  mates: {
    platform: "win32" | "darwin" | "linux" | string;
    setColorScheme(scheme: "system" | "light" | "dark"): void;
  };
}
