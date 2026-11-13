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
    const names = ["DATABASE_URL", "DIRECT_DATABASE_URL", "CLERK_SECRET_KEY", "OPENROUTER_API_KEY", "COMPOSIO_API_KEY", "BROWSERBASE_API_KEY", "BROWSERBASE_PROJECT_ID", "PARALLEL_API_KEY", "EXPO_ACCESS_TOKEN", "MODAL_TOKEN_ID", "MODAL_TOKEN_SECRET", "OPENROUTER_PROVISIONING_KEY", "OPENROUTER_CODE_MODEL", "CODE_RUN_LIMIT_USD", "GITHUB_APP_ID", "GITHUB_APP_SLUG", "GITHUB_APP_PRIVATE_KEY", "GITHUB_APP_CLIENT_ID", "GITHUB_APP_CLIENT_SECRET", "SLACK_TOKEN_KEY", "API_PUBLIC_URL", "SITE_URL", "RECALL_API_KEY", "RECALL_REGION", "CALL_TOKEN_SECRET", "DECKS_ENABLED", "DECK_MODEL", "DECK_DAILY_LIMIT",
      // Usage limits: the worker checks and meters too, so it must agree with the API.
      "USAGE_ENFORCE", "DEFAULT_PLAN",
      ...["STARTER", "PLUS", "PRO", "MAX"].flatMap((plan) => [`USAGE_${plan}_WEEKLY_MICROS`, `USAGE_${plan}_SESSION_MICROS`, `PLAN_${plan}_PRICE_MICROS`]),
      ...Object.keys(process.env).filter((name) => name.startsWith("PRICE_"))];
    // Reserved TRIGGER_* values are provided by Trigger, not synced from the laptop.
    return [...names.flatMap(name => process.env[name] ? [{ name, value: process.env[name]!, isSecret: true }] : []), { name: "COOPER_BACKGROUND_ENABLED", value: "true", isSecret: false }];
  }, { override: true })] },
});
