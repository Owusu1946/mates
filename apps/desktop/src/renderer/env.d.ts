/** apps/desktop/.env (see .env.example): public values only. */
interface ImportMetaEnv {
  readonly VITE_CLERK_PUBLISHABLE_KEY?: string;
  readonly VITE_CLERK_FRONTEND_API_HOST?: string;
  readonly VITE_API_URL?: string;
}

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
    /** The notch's page only: take the pointer over the shape, the keyboard while open, and hand-offs. */
    notch: {
      setInteractive(interactive: boolean): void;
      focus(): void;
      blur(): void;
      openInMates(handoff: { mateId: string; question: string; answer: string }): void;
      onToggle(listener: () => void): () => void;
    };
    /** Settings → This computer and Keyboard: open at login, closing, the summon shortcut, the notch. */
    setDesktopPrefs(prefs: { openAtLogin: boolean; keepRunning: boolean; summonShortcut: string; notch: boolean }): void;
    appInfo(): Promise<{ version: string; shortcut: string | null; shortcutChoices: string[] }>;
    /** A conversation handed over from the summon bar, if one is waiting. */
    takeHandoff(): Promise<{ mateId: string; question: string; answer: string } | null>;
    onHandoff(listener: () => void): () => void;
    /** Whether the main window is full screen (on a Mac, the traffic lights are hidden then). */
    onFullScreen(listener: (fullScreen: boolean) => void): () => void;
  };
}
