export function ChatWorkActivity({ quiet, steps }: { quiet: boolean; steps: readonly string[] }) {
  if (steps.length === 0) return null;

  const progress = <div className="space-y-1" role="status">{steps.map((step) => <p key={step}>{step}</p>)}</div>;

  if (!quiet) return <div className="text-xs text-ink-soft">{progress}</div>;

  return (
    <details className="self-start rounded-md text-xs text-ink-soft">
      <summary className="cursor-pointer rounded-md px-1 py-1.5 hover:text-ink focus-visible:outline-2 focus-visible:outline-brand">View activity</summary>
      <div className="mt-1 border-l border-line pl-3">{progress}</div>
    </details>
  );
}
