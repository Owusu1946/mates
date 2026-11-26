import { useState } from "react";
import { MateAvatar } from "../chat/MateAvatar.tsx";
import { Button } from "../components/ui/Button.tsx";
import { Dialog } from "../components/ui/Dialog.tsx";
import { Icon } from "../components/ui/Icon.tsx";
import { TextField } from "../components/ui/TextField.tsx";
import type { Mate } from "../data/sampleCrew.ts";
import { cn } from "../lib/utils.ts";

export type NewGroup = { title: string; mateIds: string[] };

/**
 * A group of mates working on something together: a name, and at least two mates. With `initial`,
 * it edits that group: rename it, or add and remove mates.
 */
/** Saves the group; resolves with the reason it couldn't (shown in the form), or null once saved. */
type SaveGroup = (group: NewGroup) => Promise<string | null>;

export function NewGroupDialog({ open, onOpenChange, mates, onCreate, initial }: { open: boolean; onOpenChange: (open: boolean) => void; mates: Mate[]; onCreate: SaveGroup; initial?: NewGroup }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={initial ? `Edit ${initial.title}` : "New group"} description={initial ? "Its name and who's in it. The conversation stays." : "Mates who work on something together, in one chat."}>
      {open && <NewGroupForm mates={mates} onCreate={onCreate} initial={initial} />}
    </Dialog>
  );
}

function NewGroupForm({ mates, onCreate, initial }: { mates: Mate[]; onCreate: SaveGroup; initial?: NewGroup }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState(initial?.title ?? "");
  const [picked, setPicked] = useState<string[]>(initial?.mateIds ?? []);
  const valid = title.trim().length > 0 && picked.length >= 2;
  const toggle = (id: string) => setPicked(picked.includes(id) ? picked.filter((candidate) => candidate !== id) : [...picked, id]);

  return (
    <form
      className="flex flex-col gap-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (!valid || saving) return;
        setSaving(true);
        setError(null);
        void onCreate({ title: title.trim(), mateIds: picked }).then((failed) => {
          setError(failed);
          setSaving(false);
        });
      }}
    >
      <TextField label="Name" placeholder="Wedding planning" maxLength={40} value={title} onChange={(event) => setTitle(event.target.value)} autoFocus />
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">Mates {picked.length > 0 && <span className="font-normal text-ink-soft">· {picked.length} chosen</span>}</legend>
        <div className="flex flex-col gap-0.5">
          {mates.map((mate) => {
            const on = picked.includes(mate.id);
            return (
              <button
                key={mate.id}
                type="button"
                role="checkbox"
                aria-checked={on}
                onClick={() => toggle(mate.id)}
                className="flex h-11 items-center gap-3 rounded-xl px-2 text-left outline-none transition-colors hover:bg-hover-fill focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand"
              >
                <MateAvatar mate={{ ...mate, status: on ? "happy" : "idle" }} size={28} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{mate.name}</span>
                  <span className="block truncate text-2xs text-ink-soft">{mate.role}</span>
                </span>
                <span className={cn("flex size-5 items-center justify-center rounded-md border transition-colors", on ? "border-brand bg-brand text-brand-ink" : "border-field-line")}>
                  {on && <Icon name="check" size={14} />}
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>
      {error && (
        <p role="alert" className="-mt-1 text-center text-sm text-danger-ink">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" className="w-full" disabled={!valid || saving}>
        {saving ? "Saving…" : picked.length < 2 ? "Choose at least two mates" : initial ? "Save" : `Create ${title.trim() || "group"}`}
      </Button>
    </form>
  );
}
