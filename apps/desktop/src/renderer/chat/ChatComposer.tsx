import { memo, type ReactNode, type Ref } from "react";
import { Button } from "../components/ui/Button.tsx";

type ChatComposerProps = {
  ref?: Ref<HTMLTextAreaElement>;
  draft: string;
  placeholder: string;
  /** A reply is on its way: sending waits, and the button stops it instead. */
  busy: boolean;
  onDraft: (text: string) => void;
  onSend: () => void;
  onStop: () => void;
  /** Under the box, like the Code view's branch toolbar. */
  footer?: ReactNode;
  /** Can't send at all right now, e.g. while the mate waits on your answer above. */
  disabled?: boolean;
};

/**
 * Where you write to a mate, on T3 Code's composer surface: a rounded glass panel over the
 * timeline. Enter sends, Shift+Enter starts a new line, Escape stops a reply. The field grows with
 * its text (CSS field-sizing) up to a limit, then scrolls. Memoised: typing re-renders only this.
 */
export const ChatComposer = memo(function ChatComposer({ ref, draft, placeholder, busy, onDraft, onSend, onStop, footer, disabled = false }: ChatComposerProps) {
  const canSend = draft.trim().length > 0 && !busy && !disabled;
  return (
    <div className="mx-auto w-full max-w-(--chat-max-width) px-6 pb-5">
      <div className="flex items-end gap-2 rounded-2xl border border-line bg-raised/80 p-2 shadow-composer backdrop-blur-md backdrop-saturate-[1.14] transition-colors has-[textarea:focus]:border-brand dark:shadow-none">
        <textarea
          ref={ref}
          data-focus-area="composer"
          rows={1}
          value={draft}
          placeholder={placeholder}
          aria-label={placeholder}
          className="block max-h-50 min-h-8 min-w-0 flex-1 resize-none bg-transparent px-2 py-1.5 leading-5 outline-none field-sizing-content placeholder:text-ink-soft/70"
          onChange={(event) => onDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              if (canSend) onSend();
            } else if (event.key === "Escape" && busy) {
              event.preventDefault();
              onStop();
            }
          }}
        />
        {busy ? (
          <Button variant="secondary" size="icon" icon="square" aria-label="Stop" onClick={onStop} />
        ) : (
          <Button size="icon" icon="arrowUp" aria-label="Send" disabled={!canSend} onClick={onSend} />
        )}
      </div>
      {footer && <div className="mt-1.5 px-1">{footer}</div>}
    </div>
  );
});
