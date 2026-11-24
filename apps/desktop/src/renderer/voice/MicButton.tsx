import { Button } from "../components/ui/Button.tsx";

type MicButtonProps = {
  listening: boolean;
  onStart: () => void;
  onRelease: () => void;
  onCancel: () => void;
  size?: "icon" | "icon-sm";
};

/**
 * Press and hold to talk. The pointer is captured, so letting go anywhere sends; a cancelled
 * pointer (the window losing it) drops the recording. From the keyboard, hold Space or Enter.
 */
export function MicButton({ listening, onStart, onRelease, onCancel, size = "icon-sm" }: MicButtonProps) {
  return (
    <Button
      variant={listening ? "default" : "ghost-muted"}
      size={size}
      icon="mic"
      aria-label="Hold to talk"
      aria-pressed={listening}
      title="Hold to talk"
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        onStart();
      }}
      onPointerUp={onRelease}
      onPointerCancel={onCancel}
      onKeyDown={(event) => {
        if (event.key === "Escape" && listening) {
          event.preventDefault();
          onCancel();
        } else if ((event.key === " " || event.key === "Enter") && !event.repeat) {
          event.preventDefault();
          onStart();
        }
      }}
      onKeyUp={(event) => {
        if (event.key === " " || event.key === "Enter") onRelease();
      }}
    />
  );
}
