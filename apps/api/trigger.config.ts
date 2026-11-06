import "./src/load-env.js";
import { defineConfig } from "@trigger.dev/sdk";
import { syncEnvVars } from "@trigger.dev/build/extensions/core";

export default defineConfig({
  // Cloud indexing imports this file without local .env or reserved TRIGGER_* variables.
  project: process.env.TRIGGER_PROJECT_REF ?? "proj_eoagsiurjiyczepdfzff",
  runtime: "node",
  dirs: ["./src/trigger"],
  maxDuration: 720,
  retries: { enabledInDev: false, default: { maxAttempts: 1 } },
  build: { extensions: [syncEnvVars(() => {
    const names = ["DATABASE_URL", "DIRECT_DATABASE_URL", "CLERK_SECRET_KEY", "OPENROUTER_API_KEY", "COMPOSIO_API_KEY", "BROWSERBASE_API_KEY", "BROWSERBASE_PROJECT_ID", "EXPO_ACCESS_TOKEN"];
    // Reserved TRIGGER_* values are provided by Trigger, not synced from the laptop.
    return [...names.flatMap(name => process.env[name] ? [{ name, value: process.env[name]!, isSecret: true }] : []), { name: "COOPER_BACKGROUND_ENABLED", value: "true", isSecret: false }];
  }, { override: true })] },
});
