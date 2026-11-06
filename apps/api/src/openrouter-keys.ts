const API = "https://openrouter.ai/api/v1/keys";

export type RunKey = { key: string; hash: string | null };

/**
 * A throwaway OpenRouter key for one coding run, capped at `limitUsd`. Code from the repo runs
 * beside the coding agent, so the main key never enters the sandbox: a leak is worth the cap,
 * and the key is deleted when the run ends.
 */
export async function createRunKey(runId: string, limitUsd = Number(process.env.CODE_RUN_LIMIT_USD ?? 3)): Promise<RunKey> {
  const provisioning = process.env.OPENROUTER_PROVISIONING_KEY;
  if (!provisioning) throw new Error("Coding runs need OPENROUTER_PROVISIONING_KEY so the sandbox never holds the main key.");
  const response = await fetch(API, {
    method: "POST",
    headers: { authorization: `Bearer ${provisioning}`, "content-type": "application/json" },
    body: JSON.stringify({ name: `mates-run-${runId}`, limit: limitUsd }),
  });
  if (!response.ok) throw new Error(`OpenRouter refused a run key (${response.status}).`);
  const body = (await response.json()) as { key?: string; data?: { hash?: string } };
  if (!body.key) throw new Error("OpenRouter returned no run key.");
  return { key: body.key, hash: body.data?.hash ?? null };
}

/** What a run key has spent, in dollars. Null when OpenRouter can't say. */
export async function runKeyUsage(runKey: RunKey | null) {
  if (!runKey?.hash || !process.env.OPENROUTER_PROVISIONING_KEY) return null;
  try {
    const response = await fetch(`${API}/${runKey.hash}`, { headers: { authorization: `Bearer ${process.env.OPENROUTER_PROVISIONING_KEY}` }, signal: AbortSignal.timeout(10_000) });
    const body = (await response.json()) as { data?: { usage?: number } };
    return typeof body.data?.usage === "number" ? body.data.usage : null;
  } catch {
    return null;
  }
}

/** Best effort: a key that can't be deleted still expires in value at its cap. */
export async function deleteRunKey(runKey: RunKey | null) {
  if (!runKey?.hash || !process.env.OPENROUTER_PROVISIONING_KEY) return;
  await fetch(`${API}/${runKey.hash}`, { method: "DELETE", headers: { authorization: `Bearer ${process.env.OPENROUTER_PROVISIONING_KEY}` } }).catch(() => undefined);
}
