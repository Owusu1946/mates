import { Icon } from "../components/ui/Icon.tsx";
import { Menu, MenuItem, MenuLabel } from "../components/ui/Menu.tsx";
import type { Message } from "../data/sampleCrew.ts";
import { jumpToMessage } from "./MessageRow.tsx";

/**
 * The chat's pinned messages, in a slim strip under the header: the latest one showing, all of
 * them a click away, each one jumping to where it was said. Nothing pinned, nothing shown.
 */
export function PinnedBar({ pinned, nameOf, onUnpin }: { pinned: Message[]; nameOf: (author: string) => string; onUnpin: (message: Message) => void }) {
  const latest = pinned.at(-1);
  if (!latest) return null;
  return (
    <div className="animate-fade flex h-9 shrink-0 items-center gap-2 border-b border-line px-4 text-xs">
      <Icon name="pin" size={13} className="shrink-0 text-brand" />
      <button type="button" onClick={() => jumpToMessage(latest.id)} className="min-w-0 flex-1 truncate text-left text-ink-soft hover:text-ink">
        <span className="font-medium text-ink">{nameOf(latest.author)}:</span> {latest.text}
      </button>
      {pinned.length > 1 && (
        <Menu
          align="end"
          trigger={
            <button type="button" className="shrink-0 rounded-md px-1.5 py-0.5 font-medium text-ink-soft tabular-nums hover:bg-hover-fill hover:text-ink">
              {pinned.length} pinned
            </button>
          }
        >
          <MenuLabel>Pinned</MenuLabel>
          {[...pinned].reverse().map((message) => (
            <MenuItem key={message.id} onClick={() => jumpToMessage(message.id)} className="h-auto max-w-80 items-start py-1.5">
              <span className="min-w-0">
                <span className="block text-xs font-medium">{nameOf(message.author)}</span>
                <span className="line-clamp-2 text-xs text-ink-soft">{message.text}</span>
              </span>
            </MenuItem>
          ))}
        </Menu>
      )}
      <button type="button" aria-label="Unpin" title="Unpin" onClick={() => onUnpin(latest)} className="shrink-0 rounded-md p-1 text-ink-soft hover:bg-hover-fill hover:text-ink">
        <Icon name="x" size={12} />
      </button>
    </div>
  );
}
