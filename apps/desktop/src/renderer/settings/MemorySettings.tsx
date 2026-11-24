import { useState } from "react";
import { Button } from "../components/ui/Button.tsx";
import { Icon } from "../components/ui/Icon.tsx";
import { Mascot } from "../components/ui/Mascot.tsx";
import { Menu, MenuItem, MenuSeparator } from "../components/ui/Menu.tsx";
import { Switch } from "../components/ui/Switch.tsx";
import type { Mate, SampleProfile } from "../data/sampleCrew.ts";
import { cn } from "../lib/utils.ts";
import { timeAgo } from "../places/places.logic.ts";
import { gradientOf } from "../theme/matePalette.ts";
import { editMemory, forgetAllMemories, forgetMemory, restoreMemory, seedFromProfile, shareMemory, useMemories } from "./memories.ts";
import { cleanMemoryText, exportMemories, groupMemories, MAX_MEMORY_CHARS, searchMemories, sourceLabel, type Memory } from "./memory.logic.ts";
import { setPreference, usePreferences } from "./preferences.ts";
import { Group, Row, SettingsPage } from "./SettingsParts.tsx";

/**
 * Everything your mates remember, to read, search, fix and forget: the phone's Memory screen
 * (apps/mobile/app/(app)/memory.tsx), with room to see it all at once.
 */
export function MemorySettings({ mates, profile }: { mates: Mate[]; profile?: SampleProfile }) {
  useState(() => seedFromProfile(profile));
  const { memory: settings } = usePreferences();
  const memories = useMemories();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [forgotten, setForgotten] = useState<Memory | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const [copied, setCopied] = useState(false);

  const off = !settings.enabled;
  const sections = groupMemories(searchMemories(memories, search), mates.map((mate) => mate.id));
  const grouped = sections.some((section) => section.mateId);

  const forget = (memory: Memory) => {
    forgetMemory(memory.id);
    setForgotten(memory);
  };
  const exported = () => exportMemories(memories, mates, Date.now());
  const copy = () => {
    void navigator.clipboard.writeText(exported().text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  };
  const download = () => {
    const { text, filename } = exported();
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  };

  return (
    <SettingsPage title="Memory" description="Your mates remember useful things, so you don't have to repeat yourself.">
      <Group>
        <Row label="Memory" hint="Let your mates save and use memories">
          <Switch label="Memory" on={settings.enabled} onChange={(enabled) => setPreference("memory", { enabled })} />
        </Row>
        {!off && (
          <>
            <Row label="Save automatically" hint="Useful details from your chats">
              <Switch label="Save automatically" on={settings.saveAutomatically} onChange={(saveAutomatically) => setPreference("memory", { saveAutomatically })} />
            </Row>
            <Row label="Use past chats" hint="Look back at earlier conversations when it helps">
              <Switch label="Use past chats" on={settings.referenceChats} onChange={(referenceChats) => setPreference("memory", { referenceChats })} />
            </Row>
          </>
        )}
      </Group>

      {profile?.bio && (
        <Group title="About you" description="What you told your mates when you set up.">
          <p className="px-3.5 py-3 text-sm whitespace-pre-wrap wrap-anywhere select-text">{profile.bio}</p>
        </Group>
      )}

      <section className={cn("flex flex-col gap-3 transition-opacity", off && "opacity-55")}>
        <div className="flex items-center gap-2 px-1">
          <h3 className="flex-1 text-sm font-medium">
            Saved memories {memories.length > 0 && <span className="font-normal text-ink-soft tabular-nums">{memories.length}</span>}
          </h3>
          {confirmAll ? (
            <>
              <span className="text-xs text-ink-soft">Forget everything? This can't be undone.</span>
              <Button size="xs" variant="ghost" onClick={() => setConfirmAll(false)}>
                Keep
              </Button>
              <Button
                size="xs"
                variant="outline"
                className="text-danger-ink"
                onClick={() => {
                  forgetAllMemories();
                  setConfirmAll(false);
                  setForgotten(null);
                }}
              >
                Delete all
              </Button>
            </>
          ) : (
            memories.length > 0 && (
              <Menu
                align="end"
                trigger={
                  <Button size="xs" variant="ghost" aria-label="Memory options">
                    {copied ? "Copied" : "Export"}
                    <Icon name="more" />
                  </Button>
                }
              >
                <MenuItem icon="copy" onClick={copy}>
                  Copy as text
                </MenuItem>
                <MenuItem icon="file" onClick={download}>
                  Save as a file
                </MenuItem>
                <MenuSeparator />
                <MenuItem icon="x" className="text-danger-ink" onClick={() => setConfirmAll(true)}>
                  Delete all…
                </MenuItem>
              </Menu>
            )
          )}
        </div>

        {memories.length > 5 && (
          <label className="flex h-9 items-center gap-2 rounded-lg border border-field-line bg-canvas px-3 transition-shadow has-focus-visible:border-brand has-focus-visible:ring-[3px] has-focus-visible:ring-brand/20 dark:bg-field-line/30">
            <Icon name="search" size={15} className="text-ink-soft" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => event.key === "Escape" && search && (event.stopPropagation(), setSearch(""))}
              placeholder="Search memories"
              aria-label="Search memories"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-soft/80"
            />
            {search && (
              <button type="button" aria-label="Clear search" onClick={() => setSearch("")} className="text-ink-soft hover:text-ink">
                <Icon name="x" size={14} />
              </button>
            )}
          </label>
        )}

        {forgotten && (
          <div role="status" className="motion-swap flex items-center gap-3 rounded-lg bg-soft px-3 py-2 text-sm">
            <span className="min-w-0 flex-1 truncate text-ink-soft">Forgot “{forgotten.text}”</span>
            <Button
              size="xs"
              variant="ghost"
              onClick={() => {
                restoreMemory(forgotten);
                setForgotten(null);
              }}
            >
              Undo
            </Button>
          </div>
        )}

        {memories.length === 0 ? (
          <div className="flex flex-col items-center gap-1.5 rounded-xl border border-dashed border-line py-10 text-center">
            <Icon name="brain" size={22} className="text-ink-soft" />
            <p className="text-sm font-medium">Nothing saved yet</p>
            <p className="max-w-72 text-xs text-ink-soft">Tell a mate “remember that…”, or just chat. They'll keep what's useful.</p>
          </div>
        ) : sections.length === 0 ? (
          <p className="px-1 py-2 text-sm text-ink-soft">No memories match “{search.trim()}”.</p>
        ) : (
          sections.map((section) => {
            const mate = mates.find((candidate) => candidate.id === section.mateId);
            return (
              <div key={section.mateId ?? "shared"} className="flex flex-col gap-2">
                {grouped && (
                  <div className="flex items-center gap-2 px-1 pt-1 text-xs font-medium text-ink-soft">
                    {mate ? <Mascot size={18} gradient={gradientOf(mate.color)} shape={mate.shape} still /> : <Icon name="users" size={15} />}
                    {mate ? `${mate.name}'s notes` : "Shared with every mate"}
                  </div>
                )}
                <ul className="divide-y divide-line rounded-xl border border-line">
                  {section.rows.map((memory) => (
                    <MemoryRow
                      key={memory.id}
                      memory={memory}
                      editing={editing === memory.id}
                      onEditing={(on) => setEditing(on ? memory.id : null)}
                      onForget={() => forget(memory)}
                    />
                  ))}
                </ul>
              </div>
            );
          })
        )}
      </section>
    </SettingsPage>
  );
}

function MemoryRow({ memory, editing, onEditing, onForget }: { memory: Memory; editing: boolean; onEditing: (on: boolean) => void; onForget: () => void }) {
  const [draft, setDraft] = useState(memory.text);
  const clean = cleanMemoryText(draft);
  const save = () => {
    if (!clean) return;
    if (clean !== memory.text) editMemory(memory.id, clean);
    onEditing(false);
  };
  const startEditing = () => {
    setDraft(memory.text);
    onEditing(true);
  };

  if (editing) {
    return (
      <li className="flex flex-col gap-2 px-3.5 py-3">
        <textarea
          autoFocus
          value={draft}
          aria-label="Edit memory"
          maxLength={MAX_MEMORY_CHARS}
          onFocus={(event) => event.currentTarget.setSelectionRange(draft.length, draft.length)}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              save();
            }
            if (event.key === "Escape") {
              event.stopPropagation();
              onEditing(false);
            }
          }}
          className="w-full resize-none rounded-lg border border-field-line bg-canvas px-2.5 py-1.5 text-sm leading-relaxed outline-none [field-sizing:content] focus:border-brand focus:ring-[3px] focus:ring-brand/20 dark:bg-field-line/30"
        />
        <div className="flex items-center gap-2">
          <span className={cn("flex-1 text-2xs tabular-nums text-ink-soft", draft.length > MAX_MEMORY_CHARS - 50 ? "visible" : "invisible")}>
            {draft.length}/{MAX_MEMORY_CHARS}
          </span>
          <Button size="xs" variant="ghost" onClick={() => onEditing(false)}>
            Cancel
          </Button>
          <Button size="xs" disabled={!clean} onClick={save}>
            Save
          </Button>
        </div>
      </li>
    );
  }

  return (
    <li className="group flex items-start gap-3 px-3.5 py-2.5" onDoubleClick={startEditing}>
      <div className="min-w-0 flex-1">
        <p className="text-sm wrap-anywhere select-text">{memory.text}</p>
        <p className="text-xs text-ink-soft">
          {sourceLabel(memory.source)} · {timeAgo(memory.updatedAt, Date.now())}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100 has-aria-expanded:opacity-100">
        <Button size="icon-xs" variant="ghost-muted" aria-label="Edit memory" onClick={startEditing}>
          <Icon name="edit" />
        </Button>
        <Menu
          align="end"
          trigger={
            <Button size="icon-xs" variant="ghost-muted" aria-label="More for this memory">
              <Icon name="more" />
            </Button>
          }
        >
          {memory.mateId && (
            <MenuItem icon="users" onClick={() => shareMemory(memory.id)}>
              Share with all mates
            </MenuItem>
          )}
          <MenuItem icon="x" className="text-danger-ink" onClick={onForget}>
            Forget
          </MenuItem>
        </Menu>
      </div>
    </li>
  );
}
