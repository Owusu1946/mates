import { memo, useEffect, useRef, useState, type DragEvent, type ReactNode, type Ref } from "react";
import { Button } from "../components/ui/Button.tsx";
import { Icon } from "../components/ui/Icon.tsx";
import { cn } from "../lib/utils.ts";
import { joinDictation } from "../voice/dictation.logic.ts";
import { DictationControls, DictationText } from "../voice/DictationParts.tsx";
import { MicButton } from "../voice/MicButton.tsx";
import { useDictation } from "../voice/useDictation.ts";
import type { Mate, Quote } from "../data/sampleCrew.ts";
import { admitFiles, formatBytes, kindOf, type Attachment, type SentFile } from "./attachments.logic.ts";
import { MentionChips, MentionMenu, type MentionLookups } from "./MentionMenu.tsx";
import { addPick, hasPicks, mentionQuery, NO_PICKS, withoutMention, type MentionChoice, type MentionPicks } from "./mentions.logic.ts";
import { ReplyQuote } from "./ReplyQuote.tsx";

type ChatComposerProps = {
  ref?: Ref<HTMLTextAreaElement>;
  draft: string;
  placeholder: string;
  /** A reply is on its way: sending waits, and the button stops it instead. */
  busy: boolean;
  onDraft: (text: string) => void;
  /** Sends the draft, with any files you added and anything you @-mentioned. */
  onSend: (files: SentFile[], picks: MentionPicks) => void;
  onStop: () => void;
  /** Under the box, like the Code view's branch toolbar. */
  footer?: ReactNode;
  /** Can't send at all right now, e.g. while the mate waits on your answer above. */
  disabled?: boolean;
  /** Files can be added: picked, dropped or pasted. */
  attachments?: boolean;
  /** Dictation: click the mic, talk, and the words land here. Without it, there's no mic. */
  voice?: { line: string; onSend: (text: string, files: SentFile[], picks: MentionPicks) => void };
  /** In a group, the message you're answering: shown above the box until you send or let it go. */
  replyingTo?: { quote: Quote; mate?: Mate; onCancel: () => void };
  /** The @ menu: what it offers for a word, how to show mates and apps, and a line on what a pick does. */
  mentions?: MentionLookups & { choicesFor: (query: string, picks: MentionPicks) => MentionChoice[]; hint?: string };
};

/**
 * Where you write to a mate, on T3 Code's composer surface: a rounded glass panel over the
 * timeline, the text on top and a toolbar under it. Enter sends, Shift+Enter starts a new line,
 * Escape stops a reply. The field grows with its text up to a limit, then scrolls.
 *
 * The mic is hands-free: one click and you talk, with pause, cancel and Done in the toolbar. Done
 * puts the words in the box to edit; Send sends them straight away.
 *
 * Type @ for the menu: web search, a mate, a connected app. A pick leaves the text and sits above
 * it as a chip until you send. Memoised: typing re-renders only this.
 */
export const ChatComposer = memo(function ChatComposer({ ref, draft, placeholder, busy, onDraft, onSend, onStop, footer, disabled = false, attachments: canAttach = false, voice, replyingTo, mentions }: ChatComposerProps) {
  const [files, setFiles] = useState<Attachment[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [dragging, setDragging] = useState(0);
  const picker = useRef<HTMLInputElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const dictation = useDictation(voice?.line ?? "");
  const dictating = dictation.active;
  const [picks, setPicks] = useState<MentionPicks>(NO_PICKS);
  const [caret, setCaret] = useState(0);
  const [active, setActive] = useState(0);
  // Escape closes the menu for this word; typing opens it again.
  const [dismissed, setDismissed] = useState(false);
  const query = mentions && !dictating && !dismissed ? mentionQuery(draft.slice(0, caret)) : null;
  const choices = query === null ? [] : mentions!.choicesFor(query, picks);
  const menuOpen = choices.length > 0;
  const activeIndex = Math.min(active, Math.max(0, choices.length - 1));

  const pick = (choice: MentionChoice) => {
    const head = withoutMention(draft.slice(0, caret), caret);
    onDraft(withoutMention(draft, caret));
    setPicks(addPick(picks, choice));
    setActive(0);
    requestAnimationFrame(() => {
      const textarea = surface.current?.querySelector("textarea");
      textarea?.focus();
      textarea?.setSelectionRange(head.length, head.length);
      setCaret(head.length);
    });
  };

  const canSend = (draft.trim().length > 0 || files.length > 0 || hasPicks(picks)) && !busy && !disabled;
  const sent = (): SentFile[] => files.map(({ name, kind }) => ({ name, kind }));
  const clearFiles = () => {
    for (const file of files) if (file.preview) URL.revokeObjectURL(file.preview);
    setFiles([]);
  };

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(timer);
  }, [notice]);

  // While dictating, keys go to the composer: Escape cancels, Enter is Done.
  useEffect(() => {
    if (dictating) surface.current?.focus();
  }, [dictating]);

  const add = (list: FileList | File[]) => {
    const incoming = [...list].map((file) => ({ file, name: file.name || "Pasted image", size: file.size }));
    const { added, skipped } = admitFiles(files, incoming);
    setNotice(skipped);
    if (added.length === 0) return;
    setFiles([
      ...files,
      ...added.map(({ file, name, size }) => {
        const kind = kindOf(name, file.type);
        return { id: crypto.randomUUID(), name, size, kind, preview: kind === "image" ? URL.createObjectURL(file) : undefined };
      }),
    ]);
  };
  const remove = (id: string) => {
    const file = files.find((candidate) => candidate.id === id);
    if (file?.preview) URL.revokeObjectURL(file.preview);
    setFiles(files.filter((candidate) => candidate.id !== id));
  };

  const send = () => {
    if (dictating) {
      voice?.onSend(joinDictation(draft, dictation.stop()), sent(), picks);
      clearFiles();
      setPicks(NO_PICKS);
      return;
    }
    if (!canSend) return;
    onSend(sent(), picks);
    clearFiles();
    setPicks(NO_PICKS);
  };
  // The field is back on the next frame, with the cursor after the words.
  const focusField = () =>
    requestAnimationFrame(() => {
      const textarea = surface.current?.querySelector("textarea");
      textarea?.focus();
      textarea?.setSelectionRange(textarea.value.length, textarea.value.length);
    });
  const finishDictation = () => {
    onDraft(joinDictation(draft, dictation.stop()));
    focusField();
  };
  const cancelDictation = () => {
    dictation.cancel();
    focusField();
  };

  const hasFiles = (event: DragEvent) => canAttach && event.dataTransfer.types.includes("Files");

  return (
    <div className="mx-auto w-full max-w-(--chat-max-width) px-6 pb-5">
      <div
        ref={surface}
        tabIndex={dictating ? -1 : undefined}
        className={cn(
          "pointer-events-auto relative flex flex-col rounded-2xl border border-line bg-raised/80 shadow-composer outline-none backdrop-blur-md backdrop-saturate-[1.14] transition-colors has-[textarea:focus]:border-brand dark:shadow-none",
          dictating && "border-brand",
        )}
        onKeyDown={(event) => {
          if (!dictating) return;
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            cancelDictation();
          } else if (event.key === "Enter" && !(event.target instanceof HTMLButtonElement)) {
            event.preventDefault();
            if (event.metaKey || event.ctrlKey) send();
            else finishDictation();
          }
        }}
        onDragEnter={(event) => hasFiles(event) && (event.preventDefault(), setDragging((depth) => depth + 1))}
        onDragOver={(event) => hasFiles(event) && event.preventDefault()}
        onDragLeave={(event) => hasFiles(event) && setDragging((depth) => Math.max(0, depth - 1))}
        onDrop={(event) => {
          if (!hasFiles(event)) return;
          event.preventDefault();
          setDragging(0);
          add(event.dataTransfer.files);
        }}
      >
        {replyingTo && (
          <div className="motion-swap flex items-center gap-2 border-b border-line py-1.5 ps-4 pe-2">
            <Icon name="reply" size={13} className="shrink-0 text-ink-soft" />
            <ReplyQuote quote={replyingTo.quote} mate={replyingTo.mate} name={replyingTo.mate?.name ?? "You"} className="flex-1" />
            <button type="button" aria-label="Don't reply" title="Don't reply (Esc)" onClick={replyingTo.onCancel} className="shrink-0 rounded-md p-1 text-ink-soft hover:bg-hover-fill hover:text-ink">
              <Icon name="x" size={12} />
            </button>
          </div>
        )}
        {menuOpen && mentions && <MentionMenu choices={choices} active={activeIndex} hint={mentions.hint} lookups={mentions} onPick={pick} onActive={setActive} />}
        {mentions && hasPicks(picks) && <MentionChips picks={picks} lookups={mentions} onRemove={setPicks} />}
        {files.length > 0 && (
          <ul className="flex flex-wrap gap-2 px-3 pt-3" aria-label="Files to send">
            {files.map((file) => (
              <li key={file.id} className="group/file motion-swap relative flex h-11 max-w-56 items-center gap-2 rounded-lg border border-line bg-canvas pe-3 ps-1.5 text-sm">
                {file.preview ? (
                  <img src={file.preview} alt="" className="size-8 rounded-md object-cover" />
                ) : (
                  <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-md", file.kind === "pdf" ? "bg-danger/12 text-danger-ink" : "bg-soft text-ink-soft")}>
                    <Icon name="file" size={16} />
                  </span>
                )}
                <span className="min-w-0">
                  <span className="block truncate leading-4">{file.name}</span>
                  <span className="block text-2xs text-ink-soft">{file.kind === "pdf" ? "PDF" : formatBytes(file.size)}</span>
                </span>
                <button
                  type="button"
                  aria-label={`Remove ${file.name}`}
                  onClick={() => remove(file.id)}
                  className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full border border-line bg-raised text-ink-soft opacity-0 shadow-xs transition-opacity group-hover/file:opacity-100 hover:text-ink focus-visible:opacity-100"
                >
                  <Icon name="x" size={11} />
                </button>
              </li>
            ))}
          </ul>
        )}

        {dictating && dictation.clock ? (
          <DictationText clock={dictation.clock} transcript={voice?.line ?? ""} before={draft} className="max-h-50 min-h-8 overflow-y-auto px-4 pt-3 pb-1 leading-5 text-ink-soft" />
        ) : (
          <textarea
            ref={ref}
            data-focus-area="composer"
            rows={1}
            value={draft}
            placeholder={placeholder}
            aria-label={placeholder}
            aria-expanded={menuOpen}
            aria-autocomplete={mentions ? "list" : undefined}
            className="block max-h-[min(12.5rem,calc(var(--composer-viewport-height,17rem)_-_6.5rem))] min-h-8 w-full resize-none bg-transparent px-4 pt-3 pb-1 leading-5 outline-none field-sizing-content placeholder:text-ink-soft/70"
            onChange={(event) => {
              onDraft(event.target.value);
              setCaret(event.target.selectionStart);
              setDismissed(false);
              setActive(0);
            }}
            onSelect={(event) => setCaret(event.currentTarget.selectionStart)}
            onPaste={(event) => {
              if (canAttach && event.clipboardData.files.length > 0) {
                event.preventDefault();
                add(event.clipboardData.files);
              }
            }}
            onKeyDown={(event) => {
              if (menuOpen && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
                event.preventDefault();
                setActive((activeIndex + (event.key === "ArrowDown" ? 1 : choices.length - 1)) % choices.length);
              } else if (menuOpen && (event.key === "Enter" || event.key === "Tab") && !event.nativeEvent.isComposing) {
                event.preventDefault();
                pick(choices[activeIndex]!);
              } else if (menuOpen && event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                setDismissed(true);
              } else if (event.key === "Backspace" && !draft && hasPicks(picks)) {
                // Backspace in an empty box takes back the last pick, as chips usually do.
                event.preventDefault();
                setPicks(picks.chief ? { ...picks, chief: false } : picks.web ? { ...picks, web: false } : picks.app ? { ...picks, app: null } : { ...picks, mates: picks.mates.slice(0, -1) });
              } else if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                send();
              } else if (event.key === "Escape" && busy) {
                event.preventDefault();
                onStop();
              } else if (event.key === "Escape" && replyingTo) {
                event.preventDefault();
                replyingTo.onCancel();
              }
            }}
          />
        )}

        <div className="flex items-center gap-1 p-2 pt-1">
          {dictating ? (
            <>
              <DictationControls dictation={dictation} onCancel={cancelDictation} />
              <Button size="sm" variant="secondary" onClick={finishDictation} title="Put the words in the box (Enter)">
                <Icon name="check" />
                Done
              </Button>
            </>
          ) : (
            <>
              {canAttach && (
                <>
                  <Button size="icon-sm" variant="ghost-muted" aria-label="Add files" title="Add files" disabled={disabled} onClick={() => picker.current?.click()}>
                    <Icon name="plus" />
                  </Button>
                  <input
                    ref={picker}
                    type="file"
                    multiple
                    hidden
                    onChange={(event) => {
                      if (event.target.files) add(event.target.files);
                      event.target.value = "";
                    }}
                  />
                </>
              )}
              {notice && (
                <span role="status" className="animate-fade min-w-0 truncate px-1 text-xs text-ink-soft">
                  {notice}
                </span>
              )}
              <span className="flex-1" />
              {voice && !busy && !disabled && <MicButton onStart={dictation.start} />}
            </>
          )}
          <Button
            variant={busy ? "secondary" : "default"}
            size="icon-sm"
            aria-label={busy ? "Stop" : "Send"}
            disabled={!busy && !canSend && !dictating}
            onClick={busy ? onStop : send}
            className="ms-1"
          >
            <span className="grid size-4 place-items-center">
              <Icon name="arrowUp" className={cn("motion-action-icon", !busy && "is-visible")} />
              <Icon name="square" className={cn("motion-action-icon", busy && "is-visible")} />
            </span>
          </Button>
        </div>

        {dragging > 0 && (
          <div className="animate-fade pointer-events-none absolute inset-0 flex items-center justify-center gap-2 rounded-[inherit] border-2 border-dashed border-brand bg-raised/90 text-sm font-medium">
            <Icon name="paperclip" size={16} />
            Drop to add
          </div>
        )}
      </div>
      {footer && <div className="pointer-events-auto mt-1.5 w-fit max-w-full px-1">{footer}</div>}
    </div>
  );
});
