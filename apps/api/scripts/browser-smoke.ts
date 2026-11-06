import "../src/load-env.js";
import Browserbase from "@browserbasehq/sdk";
import { browserbase, Stagehand } from "@browserbasehq/stagehand";
import { browserModel } from "../src/browser.js";
import { z } from "zod";

const apiKey = process.env.BROWSERBASE_API_KEY!;
const projectId = process.env.BROWSERBASE_PROJECT_ID!;
const sdk = new Browserbase({ apiKey, maxRetries: 0, timeout: 20_000 });
let browser: Awaited<ReturnType<typeof browserbase.launch>> | undefined;
let stagehand: Stagehand | undefined;
try {
  await sdk.projects.retrieve(projectId);
  console.log("Browserbase project credentials verified.");
  browser = await browserbase.launch({ apiKey, projectId, keepAlive: false, api_timeout: 120 });
  stagehand = await Stagehand.create({ browser, model: browserModel, logging: { level: "off" } });
  const page = await browser.context.activePage() ?? await browser.context.newPage();
  await page.goto("https://example.com");
  const result = await stagehand.extract("Read the heading on this example page.", z.object({ heading: z.string() }));
  if (result.data.heading !== "Example Domain") throw new Error("Unexpected extraction result");
  const preview = await sdk.sessions.debug(browser.sessionId!);
  if (!preview.debuggerFullscreenUrl) throw new Error("No live view URL returned");
  console.log("Cloud browser, OpenRouter extraction and live view verified.");
} catch (error) {
  // SDK error objects can contain request headers. Never dump them.
  console.error("Browser smoke check failed:", error instanceof Error ? error.message.replace(/bb_live_[\w-]+/g, "[redacted]") : "Unknown failure");
  process.exitCode = 1;
} finally {
  await stagehand?.close().catch(() => {});
  await browser?.close().catch(() => {});
  console.log("Smoke-check browser released.");
}
