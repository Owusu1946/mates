import { AppLogo } from "../components/AppLogo.tsx";
import { Icon } from "../components/ui/Icon.tsx";
import type { Mate } from "../data/sampleCrew.ts";
import { cn } from "../lib/utils.ts";
import type { AppConnection } from "../settings/apps.logic.ts";
import { MateAvatar } from "./MateAvatar.tsx";
import type { MentionChoice, MentionPicks } from "./mentions.logic.ts";

export type MentionLookups = { mateOf: (id: string) => Mate | undefined; appOf: (slug: string) => AppConnection | undefined };

const SECTION: Record<MentionChoice["kind"], string> = { web: "Tools", chief: "Tools", mate: "Mates", app: "Apps" };

function Glyph({ name }: { name: "globe" | "users" }) {
  return (
    <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-soft text-ink">
      <Icon name={name} size={15} />
    </span>
  );
}

/**
 * What the @ offers, floating above the box: tools first, then mates, then connected apps, each
 * under a quiet label. Arrow keys move, Enter or Tab picks, Escape closes; the pointer works too.
 */
export function MentionMenu({ choices, active, hint, lookups, onPick, onActive }: { choices: MentionChoice[]; active: number; hint?: string; lookups: MentionLookups; onPick: (choice: MentionChoice) => void; onActive: (index: number) => void }) {
  return (
    <div role="listbox" aria-label="Mention" className="motion-popover absolute bottom-full left-2 z-30 mb-2 max-h-80 w-80 origin-bottom-left overflow-y-auto overscroll-contain rounded-xl border border-line bg-raised p-1 shadow-lg shadow-black/10 dark:shadow-black/50">
      {hint && <p className="px-2.5 pt-1.5 pb-1 text-2xs text-ink-soft">{hint}</p>}
      {choices.map((choice, index) => {
        const section = SECTION[choice.kind];
        const mate = choice.kind === "mate" ? lookups.mateOf(choice.mate.id) : undefined;
        const app = choice.kind === "app" ? lookups.appOf(choice.app.slug) : undefined;
        return (
          <div key={choice.id}>
            {(index === 0 || SECTION[choices[index - 1]!.kind] !== section) && <p className="px-2.5 pt-2 pb-1 text-2xs font-medium text-ink-soft">{section}</p>}
            <div
              role="option"
              aria-selected={index === active}
              onMouseMove={() => onActive(index)}
              onMouseDown={(event) => {
                event.preventDefault();
                onPick(choice);
              }}
              className={cn("flex h-10 cursor-default items-center gap-2.5 rounded-lg px-2 text-sm", index === active && "bg-hover-fill")}
            >
              {choice.kind === "web" && <Glyph name="globe" />}
              {choice.kind === "chief" && <Glyph name="users" />}
              {choice.kind === "mate" && (mate ? <MateAvatar mate={{ ...mate, status: "idle" }} size={28} still /> : <Glyph name="users" />)}
              {choice.kind === "app" && <AppLogo name={choice.app.name} slug={choice.app.slug} logo={app?.logo} size={28} />}
              <span className="min-w-0 flex-1 truncate font-medium">
                {choice.kind === "web" ? "Web search" : choice.kind === "chief" ? "Chief of Staff" : choice.kind === "mate" ? choice.mate.name : choice.app.name}
              </span>
              <span className="shrink-0 text-xs text-ink-soft">
                {choice.kind === "web" ? "Look it up" : choice.kind === "chief" ? "Ask every mate" : choice.kind === "mate" ? mate?.role : app?.noAuth ? "Ready" : "Connected"}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** What's picked for the next message, as chips above the box; each one can go. */
export function MentionChips({ picks, lookups, onRemove }: { picks: MentionPicks; lookups: MentionLookups; onRemove: (next: MentionPicks) => void }) {
  const chip = "motion-swap flex h-7 items-center gap-1.5 rounded-full border border-line bg-canvas ps-1 pe-1 text-xs font-medium";
  const remove = (label: string, next: MentionPicks) => (
    <button type="button" aria-label={`Remove ${label}`} onClick={() => onRemove(next)} className="flex size-5 items-center justify-center rounded-full text-ink-soft hover:bg-hover-fill hover:text-ink">
      <Icon name="x" size={11} />
    </button>
  );
  return (
    <div className="flex flex-wrap gap-1.5 px-3 pt-3">
      {picks.mates.map((picked) => {
        const mate = lookups.mateOf(picked.id);
        return (
          <span key={picked.id} className={chip}>
            {mate && <MateAvatar mate={{ ...mate, status: "idle" }} size={20} still />}
            {picked.name}
            {remove(picked.name, { ...picks, mates: picks.mates.filter((candidate) => candidate.id !== picked.id) })}
          </span>
        );
      })}
      {picks.app && (
        <span className={chip}>
          <AppLogo name={picks.app.name} slug={picks.app.slug} logo={lookups.appOf(picks.app.slug)?.logo} size={20} />
          {picks.app.name}
          {remove(picks.app.name, { ...picks, app: null })}
        </span>
      )}
      {picks.web && (
        <span className={cn(chip, "ps-2")}>
          <Icon name="globe" size={13} className="text-ink-soft" />
          Web search
          {remove("web search", { ...picks, web: false })}
        </span>
      )}
      {picks.chief && (
        <span className={cn(chip, "ps-2")}>
          <Icon name="users" size={13} className="text-ink-soft" />
          Chief of Staff
          {remove("Chief of Staff", { ...picks, chief: false })}
        </span>
      )}
    </div>
  );
}
