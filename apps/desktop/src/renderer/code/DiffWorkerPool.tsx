import { WorkerPoolContext } from "@pierre/diffs/react";
import { WorkerPoolManager } from "@pierre/diffs/worker";
import DiffsWorker from "@pierre/diffs/worker/worker.js?worker";
import { useEffect, useState, type ReactNode } from "react";

/**
 * Diffs are parsed and highlighted off the main thread, in one pool the whole window shares
 * (T3 Code's DiffWorkerPoolProvider). Half the cores, between 2 and 6 workers; when the last diff
 * closes, the pool lingers 30 s so reopening the panel is instant, then shuts down. Highlighting
 * carries both themes, so switching Light and Dark re-colours without re-highlighting.
 */

const IDLE_TTL_MS = 30_000;
const poolSize = () => Math.max(2, Math.min(6, Math.floor((navigator.hardwareConcurrency || 4) / 2)));

let shared: { pool: WorkerPoolManager; consumers: number; idle: ReturnType<typeof setTimeout> | undefined } | undefined;

function ensure() {
  shared ??= {
    pool: new WorkerPoolManager({ workerFactory: () => new DiffsWorker(), poolSize: poolSize() }, { theme: { dark: "pierre-dark", light: "pierre-light" } }),
    consumers: 0,
    idle: undefined,
  };
  return shared;
}

/** Counted in an effect, not during render, so a render that never commits holds nothing. */
function acquire() {
  const pool = ensure();
  clearTimeout(pool.idle);
  pool.consumers++;
}

function release() {
  if (!shared) return;
  shared.consumers--;
  if (shared.consumers > 0) return;
  shared.idle = setTimeout(() => {
    shared?.pool.terminate();
    shared = undefined;
  }, IDLE_TTL_MS);
}

export function DiffWorkerPool({ children }: { children: ReactNode }) {
  const [pool] = useState(() => ensure().pool);
  useEffect(() => {
    acquire();
    return release;
  }, []);
  return <WorkerPoolContext value={pool}>{children}</WorkerPoolContext>;
}
