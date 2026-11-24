import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { JUMP_HINT_DELAY_MS, jumpIndexForKey } from "../sidebar/Sidebar.logic.ts";

type Shortcuts = {
  onJump: (index: number) => void;
  onSearch: () => void;
  onNewChat: () => void;
  onSettings: () => void;
  onCycleFocus: (backwards: boolean) => void;
  /** In a run: the Diff panel and the terminal drawer (T3 Code's mod+D and terminal.toggle, mod+J). */
  onToggleDiff: () => void;
  onToggleTerminal: () => void;
};

const MOD_KEY = window.mates.platform === "darwin" ? "Meta" : "Control";
const isMod = (event: KeyboardEvent) => (window.mates.platform === "darwin" ? event.metaKey : event.ctrlKey);

/**
 * The window's shortcuts, caught in the capture phase so a focused field can't swallow them
 * (T3 Code's keybindings): Ctrl/⌘ 1–9 jump, K searches, N starts a chat, comma opens settings,
 * D and J toggle a run's Diff and terminal, F6 moves between areas. Holding Ctrl/⌘ shows the jump
 * numbers after a beat.
 */
export function useGlobalShortcuts(shortcuts: Shortcuts): { showJumpHints: boolean } {
  const [showJumpHints, setShowJumpHints] = useState(false);
  // The listener is added once; it always calls the latest handlers.
  const latest = useRef(shortcuts);
  useLayoutEffect(() => {
    latest.current = shortcuts;
  });

  useEffect(() => {
    let hintTimer: ReturnType<typeof setTimeout> | undefined;
    const hideHints = () => {
      clearTimeout(hintTimer);
      hintTimer = undefined;
      setShowJumpHints(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === MOD_KEY) {
        if (!event.repeat && !hintTimer) hintTimer = setTimeout(() => setShowJumpHints(true), JUMP_HINT_DELAY_MS);
        return;
      }
      if (event.key === "F6") {
        event.preventDefault();
        latest.current.onCycleFocus(event.shiftKey);
        return;
      }
      if (!isMod(event) || event.altKey) return;
      const jump = jumpIndexForKey(event.key);
      const key = event.key.toLowerCase();
      if (jump !== null) latest.current.onJump(jump);
      else if (key === "k") latest.current.onSearch();
      else if (key === "n") latest.current.onNewChat();
      else if (key === ",") latest.current.onSettings();
      else if (key === "d") latest.current.onToggleDiff();
      else if (key === "j") latest.current.onToggleTerminal();
      else {
        // Any other combination (Ctrl+C…) isn't a jump: hide the numbers.
        hideHints();
        return;
      }
      event.preventDefault();
      hideHints();
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === MOD_KEY) hideHints();
    };

    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    window.addEventListener("blur", hideHints);
    return () => {
      hideHints();
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
      window.removeEventListener("blur", hideHints);
    };
  }, []);

  return { showJumpHints };
}
