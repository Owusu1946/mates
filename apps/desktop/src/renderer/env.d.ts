/** What the preload puts on window (src/preload/index.ts). */
interface Window {
  mates: {
    platform: "win32" | "darwin" | "linux" | string;
    setColorScheme(scheme: "system" | "light" | "dark"): void;
    /** The summon bar's page only. */
    summon: {
      resize(height: number): void;
      hide(): void;
      openInMates(handoff: { mateId: string; question: string; answer: string }): void;
      onShown(listener: () => void): () => void;
    };
    /** A conversation handed over from the summon bar, if one is waiting. */
    takeHandoff(): Promise<{ mateId: string; question: string; answer: string } | null>;
    onHandoff(listener: () => void): () => void;
  };
}
