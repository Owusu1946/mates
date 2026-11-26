import { memo, useState } from "react";
import { AppLogo } from "../components/AppLogo.tsx";
import { Button } from "../components/ui/Button.tsx";
import { Icon } from "../components/ui/Icon.tsx";
import type { Mate, Message } from "../data/sampleCrew.ts";
import type { Card } from "../data/sampleCrew.ts";
import { MessageCard } from "./cards/MessageCard.tsx";
import { MarkdownText } from "./MarkdownText.tsx";
import { MateAvatar } from "./MateAvatar.tsx";
import { MessageActions, type RowActions } from "./MessageActions.tsx";
import { ReplyQuote } from "./ReplyQuote.tsx";

type MessageRowProps = {
  message: Message;
  /** The mate who wrote it; none for your own messages. */
  mate?: Mate;
  /** Name the mate above its words: in groups, when the speaker changes. */
  showAuthor: boolean;
  onAnswer: (messageId: string, state: "allowed" | "skipped") => void;
  /** A card's new state, for cards that change (a plan running, a routine paused). */
  onCard?: (messageId: string, card: Card) => void;
  /** Copy, reply, pin and the rest. Without it (previews, a streaming reply), the row has none. */
  actions?: RowActions;
  /** Who wrote a quoted message, for its face, name and colour. */
  mateOf?: (author: string) => Mate | undefined;
  /** Saves an edit to your message; the mate answers again. */
  onEdit?: (message: Message, text: string) => void;
};

/** Scrolls a message into view and flashes it, for quotes and pins. */
export function jumpToMessage(id: string) {
  const element = document.getElementById(`message-${id}`);
  if (!element) return;
  element.scrollIntoView({ behavior: "smooth", block: "center" });
  element.dataset.flash = "";
  setTimeout(() => delete element.dataset.flash, 1200);
}

/**
 * One message. Yours sit in a bubble on the right (T3 Code's TimelineUserMessageRow); a mate's
 * words sit plainly on the canvas. Under each, its actions. Memoised so a streaming reply
 * re-renders only its own row.
 */
export const MessageRow = memo(function MessageRow({ message, mate, showAuthor, onAnswer, onCard, actions, mateOf, onEdit }: MessageRowProps) {
  const [editing, setEditing] = useState<string | null>(null);
  const mine = message.author === "me";
  const rowActions = actions && {
    ...actions,
    onAction: (target: Message, action: Parameters<RowActions["onAction"]>[1]) => (action.type === "edit" ? setEditing(target.text) : actions.onAction(target, action)),
  };
  const save = () => {
    if (editing?.trim() && editing.trim() !== message.text) onEdit?.(message, editing);
    setEditing(null);
  };

  return (
    <>
      {message.day && (
        <div className="flex items-center gap-3 py-2 text-2xs font-medium text-ink-soft" role="separator">
          <span className="h-px flex-1 bg-line" />
          {message.day}
          <span className="h-px flex-1 bg-line" />
        </div>
      )}
      {/* Off screen, the browser skips drawing the row (content-visibility), so long chats stay fast;
          while being written it's always drawn, so following the newest words never jumps. */}
      <div id={`message-${message.id}`} className={`group/message message-flash -mx-2 rounded-xl px-2 ${message.live ? "" : "[content-visibility:auto] [contain-intrinsic-size:auto_6rem]"}`}>
        {mine ? (
          <div className="flex flex-col items-end gap-1.5">
            {message.tags && (
              <ul className="flex max-w-[80%] flex-wrap justify-end gap-1" aria-label="Mentioned">
                {message.tags.map((tag) => {
                  const tagged = tag.kind === "mate" ? mateOf?.(tag.id) : undefined;
                  return (
                    <li key={`${tag.kind}:${tag.id}`} className="flex h-6 items-center gap-1 rounded-full border border-line bg-raised ps-1 pe-2 text-2xs font-medium text-ink-soft">
                      {tagged ? <MateAvatar mate={{ ...tagged, status: "idle" }} size={16} still /> : tag.kind === "app" ? <AppLogo name={tag.label} slug={tag.id} size={16} /> : <Icon name={tag.kind === "web" ? "globe" : "users"} size={12} className="ms-0.5" />}
                      {tag.label}
                    </li>
                  );
                })}
              </ul>
            )}
            {message.files && (
              <ul className="flex max-w-[80%] flex-wrap justify-end gap-1.5" aria-label="Files">
                {message.files.map((file, index) => (
                  <li key={`${file.name}-${index}`} className="flex h-8 max-w-56 items-center gap-1.5 rounded-lg border border-line bg-raised px-2 text-xs">
                    <Icon name="file" size={14} className={file.kind === "pdf" ? "text-danger-ink" : "text-ink-soft"} />
                    <span className="truncate">{file.name}</span>
                  </li>
                ))}
              </ul>
            )}
            {editing !== null ? (
              <div className="flex w-[80%] flex-col gap-2 rounded-2xl border border-brand bg-raised p-2">
                <textarea
                  autoFocus
                  aria-label="Edit your message"
                  value={editing}
                  onFocus={(event) => event.currentTarget.setSelectionRange(editing.length, editing.length)}
                  onChange={(event) => setEditing(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                      event.preventDefault();
                      save();
                    } else if (event.key === "Escape") {
                      event.preventDefault();
                      event.stopPropagation();
                      setEditing(null);
                    }
                  }}
                  className="w-full resize-none bg-transparent px-2 py-1 leading-relaxed outline-none field-sizing-content"
                />
                <div className="flex items-center justify-end gap-1.5">
                  <span className="me-auto px-2 text-2xs text-ink-soft">Your mate will answer again from here.</span>
                  <Button size="xs" variant="ghost" onClick={() => setEditing(null)}>
                    Cancel
                  </Button>
                  <Button size="xs" disabled={!editing.trim()} onClick={save}>
                    Send
                  </Button>
                </div>
              </div>
            ) : (
              message.text && (
                <div className={`max-w-[80%] rounded-2xl bg-bubble px-4 py-2.5 ${message.replyTo ? "min-w-60 pt-2" : ""} ${message.failed ? "opacity-70 ring-1 ring-danger/40" : ""}`}>
                  {/* The quote takes the bubble's width without widening it; the message sets the size. */}
                  {message.replyTo && (
                    <div className="mb-1 w-0 min-w-full">
                      <ReplyQuote
                        quote={message.replyTo}
                        mate={mateOf?.(message.replyTo.author)}
                        name={mateOf?.(message.replyTo.author)?.name ?? "You"}
                        onClick={() => jumpToMessage(message.replyTo!.id)}
                      />
                    </div>
                  )}
                  <p className="leading-relaxed wrap-anywhere whitespace-pre-wrap select-text">{message.text}</p>
                </div>
              )
            )}
            {message.failed ? (
              <p className="flex items-center gap-1.5 text-xs text-danger-ink" role="status">
                <Icon name="alert" size={13} />
                {message.failedReason ? `Didn't send: ${message.failedReason}` : "Didn't send."}
                <Button size="xs" variant="link" disabled={actions?.busy} onClick={() => actions?.onAction(message, { type: "retry" })}>
                  Try again
                </Button>
              </p>
            ) : (
              editing === null && (message.edited || message.pinned || rowActions) && (
                <div className="flex items-center gap-2">
                  {message.pinned && !rowActions && <Icon name="pin" size={12} className="text-brand" />}
                  {message.edited && <span className="text-2xs text-ink-soft">Edited</span>}
                  {rowActions && <MessageActions message={message} actions={rowActions} mine />}
                </div>
              )
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {showAuthor && mate && (
              <div className="flex items-center gap-2 text-xs font-medium">
                <MateAvatar mate={mate} size={18} />
                {mate.name}
              </div>
            )}
            {message.text && <MarkdownText text={message.text} />}
            {message.card && <MessageCard card={message.card} authorId={message.author} onAnswer={(state) => onAnswer(message.id, state)} onChange={(card) => onCard?.(message.id, card)} />}
            {(rowActions || message.pinned) && (
              <div className="-ms-1.5 -mt-1 flex items-center gap-1">
                {message.pinned && !rowActions && <Icon name="pin" size={12} className="ms-1.5 text-brand" />}
                {rowActions && <MessageActions message={message} actions={rowActions} mine={false} />}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}, sameRow);

/** Rows get a fresh `actions` object each render; what matters is what's in it. */
function sameRow(before: MessageRowProps, after: MessageRowProps) {
  const a = before.actions;
  const b = after.actions;
  const sameActions = a === b || (!!a && !!b && a.onAction === b.onAction && a.replyable === b.replyable && a.regenerable === b.regenerable && a.latest === b.latest && a.busy === b.busy);
  return (
    sameActions &&
    before.message === after.message &&
    before.mate === after.mate &&
    before.showAuthor === after.showAuthor &&
    before.onAnswer === after.onAnswer &&
    before.onCard === after.onCard &&
    before.mateOf === after.mateOf &&
    before.onEdit === after.onEdit
  );
}
