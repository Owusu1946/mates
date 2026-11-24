import { useState } from "react";
import { gradientOf } from "../theme/matePalette.ts";
import { Button } from "../components/ui/Button.tsx";
import { Icon } from "../components/ui/Icon.tsx";
import { Mascot } from "../components/ui/Mascot.tsx";
import { TextArea } from "../components/ui/TextField.tsx";
import { AssistantLogo } from "./AssistantLogo.tsx";
import type { Leader } from "./LeaderScreen.tsx";
import { MAX_IMPORT_CHARS, SOURCES, previewMemories, promptFor, sourceOf, type ImportSource } from "./MemoryImport.logic.ts";
import { OnboardingScreen } from "./OnboardingScreen.tsx";

/**
 * The last step: bring what ChatGPT, Claude, Gemini or Grok knows, so the new mate doesn't start
 * from zero. The sample workspace keeps the selected items for this session.
 */
export function ImportScreen({ leader, onDone }: { leader: Leader; onDone: (memories: string[]) => void }) {
  const [source, setSource] = useState<ImportSource | null>(null);

  if (source) return <ImportFlow leader={leader} source={source} onBack={() => setSource(null)} onDone={onDone} />;

  return (
    <OnboardingScreen.Root>
      <OnboardingScreen.Hero className="gap-3.5 text-ink-soft">
        <span className="flex [&>*]:-ml-2 [&>*]:ring-2 [&>*]:ring-canvas [&>*:first-child]:ml-0">
          {SOURCES.slice(0, 4).map((item) => (
            <span key={item.id} className="flex size-9.5 flex-none items-center justify-center rounded-full bg-raised text-ink shadow-xs/5 dark:bg-hover-fill">
              <AssistantLogo source={item.id} size={20} />
            </span>
          ))}
        </span>
        <Icon name="arrowRight" size={16} />
        <Mascot size={60} gradient={gradientOf(leader.color)} shape={leader.shape} still />
      </OnboardingScreen.Hero>
      <OnboardingScreen.Title>Coming from another AI?</OnboardingScreen.Title>
      <OnboardingScreen.Body>
        Bring what it knows about you, so {leader.name} doesn't start from zero. It takes about a minute, and you choose what comes over.
      </OnboardingScreen.Body>
      <OnboardingScreen.Content className="grid grid-cols-2 gap-2.5">
        {SOURCES.map((item) => (
          <button key={item.id} type="button" className="flex items-center gap-3 rounded-xl px-3 py-2.5 font-medium text-ink outline-none transition-colors hover:bg-hover-fill focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand last:col-span-2" onClick={() => setSource(item.id)}>
            <span className="flex size-9.5 flex-none items-center justify-center rounded-full bg-raised text-ink shadow-xs/5 dark:bg-hover-fill">
              <AssistantLogo source={item.id} size={20} />
            </span>
            <span>{item.name}</span>
          </button>
        ))}
      </OnboardingScreen.Content>
      <OnboardingScreen.Footer>
        <Button variant="link" onClick={() => onDone([])}>
          Skip for now
        </Button>
      </OnboardingScreen.Footer>
    </OnboardingScreen.Root>
  );
}

function ImportFlow({ leader, source: sourceId, onBack, onDone }: { leader: Leader; source: ImportSource; onBack: () => void; onDone: (memories: string[]) => void }) {
  const source = sourceOf(sourceId);
  const label = source.id === "other" ? "your assistant" : source.name;
  const [answer, setAnswer] = useState("");
  const [copied, setCopied] = useState(false);
  const [items, setItems] = useState<{ text: string; on: boolean }[] | null>(null);
  const [imported, setImported] = useState<string[] | null>(null);

  async function copyAndOpen() {
    const prompt = promptFor(source);
    await navigator.clipboard.writeText(prompt).catch(() => undefined);
    setCopied(true);
    // Opens in the system browser: the app never navigates away from its own pages.
    if (source.url) window.open(source.url(prompt), "_blank");
  }

  if (imported !== null)
    return (
      <OnboardingScreen.Root>
        <OnboardingScreen.Hero className="mb-4 gap-3.5 text-ink-soft">
          <span className="flex size-14 flex-none items-center justify-center rounded-full bg-raised text-ink shadow-xs/5 dark:bg-hover-fill">
            <AssistantLogo source={source.id} size={26} />
          </span>
          <Icon name="arrowRight" size={16} />
          <Mascot size={72} state="happy" gradient={gradientOf(leader.color)} shape={leader.shape} />
        </OnboardingScreen.Hero>
        <OnboardingScreen.Title>
          {imported.length} {imported.length === 1 ? "memory" : "memories"} from {label}
        </OnboardingScreen.Title>
        <OnboardingScreen.Body>You can view them in Settings under About you during this session.</OnboardingScreen.Body>
        <OnboardingScreen.Actions>
          <Button size="xl" className="w-full" onClick={() => onDone(imported)}>
            Continue
          </Button>
        </OnboardingScreen.Actions>
      </OnboardingScreen.Root>
    );

  if (items) {
    const selected = items.filter((item) => item.on).map((item) => item.text);
    return (
      <OnboardingScreen.Root>
        <OnboardingScreen.Back onClick={() => setItems(null)} />
        <OnboardingScreen.Title>Choose what comes over</OnboardingScreen.Title>
        <OnboardingScreen.Body>
          {items.length} things {label} knows about you. Untick anything {leader.name} shouldn't keep.
        </OnboardingScreen.Body>
        <OnboardingScreen.Content>
          <ul className="-mx-2 max-h-75 overflow-y-auto">
            {items.map((item, index) => (
              <li key={item.text}>
                <label className="flex cursor-pointer items-start gap-2.5 rounded-lg px-2 py-2 text-sm select-text hover:bg-hover-fill">
                  <input
                    type="checkbox"
                    className="mt-0.5 accent-brand"
                    checked={item.on}
                    onChange={() => setItems(items.map((other, i) => (i === index ? { ...other, on: !other.on } : other)))}
                  />
                  <span>{item.text}</span>
                </label>
              </li>
            ))}
          </ul>
          <Button size="xl" className="w-full" disabled={selected.length === 0} onClick={() => setImported(selected)}>
            Import {selected.length}
          </Button>
        </OnboardingScreen.Content>
      </OnboardingScreen.Root>
    );
  }

  const preview = previewMemories(answer);
  return (
    <OnboardingScreen.Root>
      <OnboardingScreen.Back onClick={onBack} label="All assistants" />
      <OnboardingScreen.Title>Bring what {label} knows</OnboardingScreen.Title>
      <OnboardingScreen.Body>Two steps: ask {label} with our prompt, then paste its answer here.</OnboardingScreen.Body>
      <OnboardingScreen.Content>
        <div className="flex gap-4 py-1 [&_h2]:mt-0.5 [&_h2]:mb-1 [&_h2]:text-[15px] [&_h2]:font-semibold [&_p]:mb-3 [&_p]:text-xs [&_p]:text-ink-soft">
          <span className="flex size-6.5 flex-none items-center justify-center rounded-full bg-hover-fill text-xs font-semibold">1</span>
          <div>
            <h2>Ask {label}</h2>
            <p>{source.hint}</p>
            <Button variant="outline" icon={copied ? "check" : source.url ? "external" : "copy"} onClick={() => void copyAndOpen()}>
              {copied ? (source.url ? `Copied. Open ${source.name} again` : "Prompt copied") : source.url ? `Copy prompt and open ${source.name}` : "Copy the prompt"}
            </Button>
          </div>
        </div>
        <div className="flex gap-4 py-1 [&_h2]:mt-0.5 [&_h2]:mb-1 [&_h2]:text-[15px] [&_h2]:font-semibold [&_p]:mb-3 [&_p]:text-xs [&_p]:text-ink-soft">
          <span className="flex size-6.5 flex-none items-center justify-center rounded-full bg-hover-fill text-xs font-semibold">2</span>
          <div className="min-w-0 flex-1">
            <h2>Paste the answer</h2>
            <TextArea label={`${label}'s answer`} rows={6} maxLength={MAX_IMPORT_CHARS} placeholder="Paste here" value={answer} onChange={(event) => setAnswer(event.target.value)} />
          </div>
        </div>
        <Button size="xl" className="w-full" disabled={!preview.length} onClick={() => setItems(preview.map((text) => ({ text, on: true })))}>
          Review {preview.length ? preview.length : ""} memories
        </Button>
      </OnboardingScreen.Content>
    </OnboardingScreen.Root>
  );
}
