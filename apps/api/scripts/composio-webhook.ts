/**
 * Points Composio's trigger events at this API, once per environment, for app watches.
 *   pnpm exec tsx scripts/composio-webhook.ts [api url, default API_PUBLIC_URL]
 * Prints the signing secret: put it on the API as COMPOSIO_WEBHOOK_SECRET.
 */
import "../src/load-env.js";
import { getComposio } from "../src/integrations.js";

const base = (process.argv[2] ?? process.env.API_PUBLIC_URL ?? "").replace(/\/$/, "");
if (!base.startsWith("https://")) {
  console.error("Usage: tsx scripts/composio-webhook.ts https://your-api-host");
  process.exit(1);
}
const subscription = await getComposio().triggers.setWebhookSubscription({ webhookUrl: `${base}/v1/composio/webhook` });
console.log("Composio will send trigger events to", `${base}/v1/composio/webhook`);
console.log(JSON.stringify(subscription, null, 2));
console.log("Copy the subscription's secret into Railway as COMPOSIO_WEBHOOK_SECRET (API service).");
