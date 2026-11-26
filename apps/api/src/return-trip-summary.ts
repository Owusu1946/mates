/** Choose the text that describes this transition, not an earlier step copied into a resumed run. */
export function returnTripSummary(run: {
  status: string;
  error: string | null;
  content: Record<string, unknown>[];
  request: Record<string, unknown>;
}) {
  const parts = run.content.filter((part) => part.type === "text").map((part) => String(part.text ?? "").trim()).filter(Boolean);
  const latest = parts.at(-1);
  if (run.status === "failed") return (run.error?.trim() || latest || "This task couldn’t be completed.").slice(0, 500);
  if (run.status === "waiting") return (latest || "Your attention is needed to continue.").slice(0, 500);
  const resumed = typeof run.request.resumeRunId === "string";
  return (resumed ? latest : parts.join("\n"))?.slice(0, 500) || "Your result is ready.";
}
