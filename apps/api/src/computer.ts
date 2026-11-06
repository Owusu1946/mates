import { ModalClient, type Sandbox } from "modal";
import { scrub } from "./code-plan.js";

export const WORKDIR = "/work/repo";
const APP_NAME = "mates-computer";
// One image for every repo: git, Node 22 with pnpm/yarn via corepack, bun, Python, and opencode.
// Modal caches it after the first build, so later runs start in seconds.
const IMAGE_COMMANDS = [
  "RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates python3 python3-pip ripgrep && rm -rf /var/lib/apt/lists/*",
  "RUN corepack enable && corepack prepare pnpm@latest --activate && corepack prepare yarn@stable --activate",
  "RUN npm install -g bun opencode-ai",
  "RUN git config --system init.defaultBranch main && git config --system advice.detachedHead false",
];

let client: ModalClient | undefined;
const modal = () => (client ??= new ModalClient());

export type CommandResult = { code: number; output: string };
export type Computer = {
  id: string;
  /**
   * Runs a shell command in the repo. Output is merged, scrubbed of `secrets`, and trimmed.
   * `onLine` sees each scrubbed line as it is printed, for live progress.
   */
  run(command: string, options?: { env?: Record<string, string>; timeoutMs?: number; cwd?: string; secrets?: string[]; onLine?: (line: string) => void }): Promise<CommandResult>;
  writeFile(path: string, content: string): Promise<void>;
  readFile(path: string): Promise<string | null>;
  shutdown(): Promise<void>;
};

export const computerConfigured = () => !!process.env.MODAL_TOKEN_ID && !!process.env.MODAL_TOKEN_SECRET;

/**
 * Boots a fresh sandbox for one run. Nothing secret is set at the sandbox level: tokens are
 * passed to the individual commands that need them, so the coding agent never sees them.
 */
export async function bootComputer(runId: string, timeoutMs = 60 * 60_000): Promise<Computer> {
  const app = await modal().apps.fromName(APP_NAME, { createIfMissing: true });
  const image = modal().images.fromRegistry("node:22-bookworm").dockerfileCommands(IMAGE_COMMANDS);
  const sandbox: Sandbox = await modal().sandboxes.create(app, image, {
    cpu: 2,
    memoryMiB: 4096,
    timeoutMs,
    idleTimeoutMs: 15 * 60_000,
    workdir: "/work",
    tags: { run: runId },
  });
  return wrap(sandbox);
}

/** Reattaches to a run's sandbox (e.g. to stop it from another process). */
export async function attachComputer(sandboxId: string) {
  return wrap(await modal().sandboxes.fromId(sandboxId));
}

function wrap(sandbox: Sandbox): Computer {
  return {
    id: sandbox.sandboxId,
    async run(command, options = {}) {
      const process = await sandbox.exec(["bash", "-lc", `${command} 2>&1`], {
        workdir: options.cwd ?? WORKDIR,
        env: options.env,
        timeoutMs: options.timeoutMs ?? 20 * 60_000,
      });
      const read = options.onLine ? readLines(process.stdout, (line) => options.onLine!(scrub(line, options.secrets, 1_000))) : process.stdout.readText();
      const [output, code] = await Promise.all([read, process.wait()]);
      return { code, output: scrub(output, options.secrets) };
    },
    async writeFile(path, content) {
      const process = await sandbox.exec(["bash", "-lc", `mkdir -p "$(dirname '${path}')" && cat > '${path}'`]);
      await process.stdin.writeText(content);
      await process.stdin.close();
      if ((await process.wait()) !== 0) throw new Error(`Couldn’t write ${path}.`);
    },
    async readFile(path) {
      const process = await sandbox.exec(["bash", "-lc", `cat '${path}' 2>/dev/null`]);
      const [text, code] = await Promise.all([process.stdout.readText(), process.wait()]);
      return code === 0 ? text : null;
    },
    async shutdown() {
      await sandbox.terminate().catch(() => undefined);
    },
  };
}

/** Reads a stream to the end, calling `onLine` for every complete line on the way. */
async function readLines(stream: ReadableStream<string>, onLine: (line: string) => void) {
  let all = "";
  let pending = "";
  for await (const chunk of stream as unknown as AsyncIterable<string>) {
    all += chunk;
    const lines = (pending + chunk).split("\n");
    pending = lines.pop()!;
    for (const line of lines) if (line.trim()) onLine(line);
  }
  if (pending.trim()) onLine(pending);
  return all;
}

/**
 * Git authentication for one command, via environment-only config: the token never lands in
 * `.git/config`, a file, or the process list.
 */
export function gitAuthEnv(token: string): Record<string, string> {
  const basic = Buffer.from(`x-access-token:${token}`).toString("base64");
  return {
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "http.https://github.com/.extraheader",
    GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${basic}`,
    GIT_TERMINAL_PROMPT: "0",
  };
}
