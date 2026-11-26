import { useEffect, useState } from "react";
import { Button } from "../components/ui/Button.tsx";
import { Icon, type IconName } from "../components/ui/Icon.tsx";
import { Menu, MenuItem } from "../components/ui/Menu.tsx";
import { FEEDBACK_REASONS, type FeedbackReason } from "../remote/feedback.ts";
import { Tooltip } from "../components/ui/Tooltip.tsx";
import type { Message } from "../data/sampleCrew.ts";
import { cn } from "../lib/utils.ts";

export type MessageAction =
  | { type: "reply" }
  | { type: "pin" }
  /** Thumbs down says why (the phone's reasons); the same thumb again takes the rating back. */
  | { type: "rate"; rating: "up" | "down"; reason?: FeedbackReason }
  | { type: "version"; index: number }
  | { type: "regenerate" }
  | { type: "edit" }
  | { type: "retry" };

/** What a row may offer, decided by the timeline: replying is for groups, asking again for the last reply. */
export type RowActions = {
  onAction: (message: Message, action: MessageAction) => void;
  replyable: boolean;
  regenerable: boolean;
  /** The latest mate reply keeps its actions showing; the rest appear on hover or focus. */
  latest: boolean;
  /** A reply is on its way, so nothing that starts another can run. */
  busy: boolean;
};

const REVEAL = "opacity-0 transition-opacity duration-150 group-focus-within/message:opacity-100 group-hover/message:opacity-100";

function Action({ icon, label, onClick, active = false, disabled = false, className }: { icon: IconName; label: string; onClick: () => void; active?: boolean; disabled?: boolean; className?: string }) {
  return (
    <Tooltip side="top" content={label}>
      <Button size="icon-xs" variant="ghost-muted" aria-label={label} aria-pressed={active || undefined} disabled={disabled} onClick={onClick} className={cn(className, active && "text-ink [&_svg]:text-brand")}>
        <Icon name={icon} />
      </Button>
    </Tooltip>
  );
}

/**
 * The row under a message: copy for everything; reply, pin, ask again and thumbs for a mate's
 * reply; edit and pin for yours. Hidden until you hover or tab to the message, so the chat stays
 * quiet, except under the latest reply. A pinned message keeps its pin showing, as its marker.
 */
export function MessageActions({ message, actions, mine }: { message: Message; actions: RowActions; mine: boolean }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1400);
    return () => clearTimeout(timer);
  }, [copied]);

  const act = (action: MessageAction) => actions.onAction(message, action);
  const versions = message.versions ?? [];
  const version = message.version ?? versions.length - 1;
  const hasText = message.text.trim().length > 0;
  const reveal = actions.latest && !mine ? undefined : REVEAL;

  return (
    <div className={cn("flex items-center gap-0.5", mine && "flex-row-reverse")}>
      {mine && <Action icon="pin" label={message.pinned ? "Unpin" : "Pin"} active={message.pinned} className={message.pinned ? undefined : reveal} onClick={() => act({ type: "pin" })} />}
      {!mine && versions.length > 1 && (
        <span className={cn("me-1 flex items-center text-2xs text-ink-soft tabular-nums", reveal)}>
          <Button size="icon-xs" variant="ghost-muted" aria-label="Previous version" disabled={version === 0 || actions.busy} onClick={() => act({ type: "version", index: version - 1 })}>
            <Icon name="chevronLeft" />
          </Button>
          {version + 1}/{versions.length}
          <Button size="icon-xs" variant="ghost-muted" aria-label="Next version" disabled={version === versions.length - 1 || actions.busy} onClick={() => act({ type: "version", index: version + 1 })}>
            <Icon name="chevronRight" />
          </Button>
        </span>
      )}
      {hasText && (
        <Action
          icon={copied ? "check" : "copy"}
          label={copied ? "Copied" : "Copy"}
          className={copied ? undefined : reveal}
          onClick={() => void navigator.clipboard.writeText(message.text).then(() => setCopied(true))}
        />
      )}
      {!mine && actions.replyable && hasText && <Action icon="reply" label="Reply" className={reveal} onClick={() => act({ type: "reply" })} />}
      {mine && hasText && <Action icon="edit" label="Edit" disabled={actions.busy} className={reveal} onClick={() => act({ type: "edit" })} />}
      {!mine && <Action icon="pin" label={message.pinned ? "Unpin" : "Pin"} active={message.pinned} className={message.pinned ? undefined : reveal} onClick={() => act({ type: "pin" })} />}
      {!mine && actions.regenerable && <Action icon="retry" label="Ask again" disabled={actions.busy} className={reveal} onClick={() => act({ type: "regenerate" })} />}
      {!mine && hasText && (
        <>
          <Action icon="thumbsUp" label="Good reply" active={message.rating === "up"} className={message.rating === "up" ? undefined : reveal} onClick={() => act({ type: "rate", rating: "up" })} />
          {message.rating === "down" ? (
            <Action icon="thumbsDown" label="Bad reply" active onClick={() => act({ type: "rate", rating: "down" })} />
          ) : (
            <Menu
              side="top"
              trigger={
                <Button size="icon-xs" variant="ghost-muted" aria-label="Bad reply" className={reveal}>
                  <Icon name="thumbsDown" />
                </Button>
              }
            >
              <p className="px-2 pt-1 pb-1.5 text-2xs font-medium text-ink-soft">What went wrong?</p>
              {FEEDBACK_REASONS.map((reason) => (
                <MenuItem key={reason.value} onClick={() => act({ type: "rate", rating: "down", reason: reason.value })}>
                  {reason.label}
                </MenuItem>
              ))}
            </Menu>
          )}
        </>
      )}
    </div>
  );
}
