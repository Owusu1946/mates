import { Button } from "../components/ui/Button.tsx";

/**
 * Starts hands-free dictation. One click and you can talk; the bar that replaces it has pause,
 * stop and cancel. (Holding Space in the summon bar is the hold-to-talk way.)
 */
export function MicButton({ onStart, size = "icon-sm" }: { onStart: () => void; size?: "icon" | "icon-sm" }) {
  return <Button variant="ghost-muted" size={size} icon="mic" aria-label="Dictate" title="Dictate" onClick={onStart} />;
}
