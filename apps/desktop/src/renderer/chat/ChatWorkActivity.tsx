export function ChatWorkActivity({ steps }: { steps: readonly string[] }) {
  return (
    <div className="space-y-1 text-xs text-ink-soft" role="status">
      {steps.map((step) => <p key={step}>{step}</p>)}
    </div>
  );
}
