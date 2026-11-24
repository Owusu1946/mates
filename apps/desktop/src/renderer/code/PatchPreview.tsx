import { cn } from "../lib/utils.ts";

/**
 * An edit's change, small, inside its timeline row: the hunk lines coloured by what they do.
 * The full, highlighted diff lives in the Diff panel; this stays cheap.
 */
export function PatchPreview({ patch }: { patch: string }) {
  const lines = patch.split("\n").filter((line) => line && !line.startsWith("---") && !line.startsWith("+++"));
  return (
    <pre className="max-h-72 overflow-auto rounded-md bg-soft py-1.5 font-mono text-xs leading-relaxed">
      {lines.map((line, index) => (
        <div
          key={index}
          className={cn(
            "px-3 whitespace-pre",
            line.startsWith("+") && "bg-ok/10 text-ok-ink",
            line.startsWith("-") && "bg-danger/10 text-danger-ink",
            line.startsWith("@@") && "text-ink-soft opacity-70",
          )}
        >
          {line}
        </div>
      ))}
    </pre>
  );
}
