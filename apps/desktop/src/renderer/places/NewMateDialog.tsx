import type { ShapeName } from "@muse-clone/mascot";
import { useEffect, useState } from "react";
import { ColorPicker, ShapePicker } from "../components/MatePickers.tsx";
import { Button } from "../components/ui/Button.tsx";
import { Dialog } from "../components/ui/Dialog.tsx";
import { Mascot } from "../components/ui/Mascot.tsx";
import { TextField } from "../components/ui/TextField.tsx";
import { MAX_NAME, nameHint } from "../onboarding/LeaderSetup.logic.ts";
import { BEAT_MS } from "../theme/mascotMotion.logic.ts";
import { gradientOf, type MateColor } from "../theme/matePalette.ts";

export type NewMate = { name: string; role: string; shape: ShapeName; color: MateColor };

const ROLE_IDEAS = ["Research", "Planning", "Money", "Health", "Shopping", "Builder"];

/**
 * A mate's name, what it helps with, a shape and a colour, with its face reacting as you choose.
 * New, it joins the sidebar and says hello in its own chat; with `initial`, it edits that mate.
 */
/** Saves the mate; resolves with the reason it couldn't (shown in the form), or null once saved. */
type SaveMate = (mate: NewMate) => Promise<string | null>;

export function NewMateDialog({ open, onOpenChange, onCreate, initial }: { open: boolean; onOpenChange: (open: boolean) => void; onCreate: SaveMate; initial?: NewMate }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={initial ? `Edit ${initial.name}` : "New mate"} description={initial ? "Their name, job and look. Their chats and memories stay." : "Someone new for your crew, with their own job."}>
      {/* Mounted per open, so each one starts fresh. */}
      {open && <NewMateForm onCreate={onCreate} initial={initial} />}
    </Dialog>
  );
}

function NewMateForm({ onCreate, initial }: { onCreate: SaveMate; initial?: NewMate }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(initial?.name ?? "");
  const [role, setRole] = useState(initial?.role ?? "");
  const [shape, setShape] = useState<ShapeName>(initial?.shape ?? "circle");
  const [color, setColor] = useState<MateColor>(initial?.color ?? "teal");
  const [beat, setBeat] = useState(0);
  const [happy, setHappy] = useState(false);
  const hint = nameHint(name);
  const valid = name.trim().length > 0 && !hint.problem;
  const react = () => setBeat(beat + 1);

  // Each choice gives the face a happy beat, as on the phone, then it settles.
  useEffect(() => {
    if (!beat) return;
    setHappy(true);
    const timer = setTimeout(() => setHappy(false), BEAT_MS);
    return () => clearTimeout(timer);
  }, [beat]);

  return (
    <form
      className="flex flex-col gap-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (!valid || saving) return;
        setSaving(true);
        setError(null);
        // "Companion" is the API's everyday role, so an empty one stays a preset, not a custom role.
        void onCreate({ name: name.trim(), role: role.trim() || "Companion", shape, color }).then((failed) => {
          setError(failed);
          setSaving(false);
        });
      }}
    >
      <div className="flex justify-center">
        <Mascot size={84} state={happy ? "happy" : "idle"} gradient={gradientOf(color)} shape={shape} />
      </div>
      <TextField label="Name" placeholder="Efua" maxLength={MAX_NAME} value={name} onChange={(event) => setName(event.target.value)} onBlur={() => name.trim() && react()} autoFocus />
      {name && hint.problem && <p className="-mt-2.5 text-xs text-danger-ink">{hint.text}</p>}
      <div className="flex flex-col gap-1.5">
        <TextField label="What they help with" placeholder="Personal assistant" maxLength={40} value={role} onChange={(event) => setRole(event.target.value)} />
        <div className="flex flex-wrap gap-1.5">
          {ROLE_IDEAS.map((idea) => (
            <button key={idea} type="button" className="h-7 rounded-full bg-hover-fill px-3 text-xs text-ink-soft transition-colors hover:text-ink" onClick={() => setRole(idea)}>
              {idea}
            </button>
          ))}
        </div>
      </div>
      <ShapePicker
        shape={shape}
        color={color}
        size={30}
        onChange={(next) => {
          setShape(next);
          react();
        }}
      />
      <ColorPicker
        color={color}
        onChange={(next) => {
          setColor(next);
          react();
        }}
      />
      {error && (
        <p role="alert" className="-mt-1 text-center text-sm text-danger-ink">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" className="w-full" disabled={!valid || saving}>
        {saving ? "Saving…" : initial ? "Save" : `Create ${name.trim() || "mate"}`}
      </Button>
    </form>
  );
}
