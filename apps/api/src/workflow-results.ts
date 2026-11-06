import { z } from "zod";
import type { WorkflowCard } from "./integrations.js";
import { trustedRetailer } from "./shopping.js";

const extractedProduct = z.object({
  price: z.string().max(80).nullable(), currency: z.string().max(12).nullable(),
  imageUrl: z.string().url().nullable(), specs: z.string().max(1200).nullable(),
  availability: z.enum(["in_stock", "out_of_stock", "unknown"]),
});

export const resultSchema = z.object({
  toolkit: z.string().min(1).max(80),
  title: z.string().min(1).max(120),
  summary: z.string().max(700),
  items: z
    .array(
      z.object({
        sourceId: z.string().min(1).max(400),
        title: z.string().min(1).max(200),
        subtitle: z.string().max(200).optional(),
        preview: z.string().max(700).optional(),
        url: z.string().url().optional(),
        metrics: z.array(z.string().max(80)).max(4).optional(),
      }),
    )
    .max(10),
  followUps: z
    .array(
      z.object({
        label: z.string().max(60),
        prompt: z.string().min(1).max(400),
      }),
    )
    .max(3),
});
export const presentationTool = {
  type: "function" as const,
  function: {
    name: "cooper_show_results",
    description:
      "Render source-grounded native result cards and useful follow-up suggestions after successful app lookups. sourceId must be an exact ID or URL present in the executed tool response. Use actual sender/subject/time for emails and actual engagement counts for posts; never invent facts or links. An empty items array represents a verified empty lookup. If response is stored remotely, inspect it with workbench first. Follow-ups prepare a new user request; never perform them automatically.",
    parameters: z.toJSONSchema(resultSchema),
  },
};
export const choiceTool = {
  type: "function" as const,
  function: {
    name: "cooper_choose_app",
    description:
      "When a request is ambiguous between apps, ask ONE clear question and offer 2-4 toolkit slugs. Prefer the app explicitly named by the user and already connected apps. Do not ask unnecessary questions. Pauses until the user chooses.",
    parameters: {
      type: "object",
      properties: {
        question: { type: "string" },
        toolkits: {
          type: "array",
          items: { type: "string" },
          minItems: 2,
          maxItems: 4,
        },
      },
      required: ["question", "toolkits"],
      additionalProperties: false,
    },
  },
};

export function collectSources(
  value: unknown,
  sources: Map<string, Record<string, unknown>>,
) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) collectSources(item, sources);
    return;
  }
  const record = value as Record<string, unknown>;
  for (const [key, id] of Object.entries(record)) {
    if (
      /^(id|message_?id|thread_?id|tweet_?id|post_?id|document_?id|url|html_url)$/i.test(
        key,
      ) &&
      (typeof id === "string" || typeof id === "number")
    )
      sources.set(String(id), record);
  }
  for (const nested of Object.values(record)) collectSources(nested, sources);
}
export function isEmptyLookup(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(isEmptyLookup);
  const record = value as Record<string, unknown>;
  if (record.remote_file_info) return false;
  for (const [key, item] of Object.entries(record)) {
    if (
      /^(messages|emails|tweets|posts|items|events|documents|records)$/i.test(
        key,
      ) &&
      Array.isArray(item) &&
      item.length === 0
    )
      return true;
    if (
      /^(result_size_estimate|resultSizeEstimate|total_count)$/i.test(key) &&
      item === 0
    )
      return true;
  }
  return Object.values(record).some(isEmptyLookup);
}
export function groundedItems(
  data: z.infer<typeof resultSchema>,
  sources: Map<string, Record<string, unknown>>,
): NonNullable<WorkflowCard["items"]> {
  return data.items.map((item) => {
    const source = sources.get(item.sourceId);
    if (!source)
      throw new Error(
        "A result ID was not found in the tool response. Inspect the actual results first.",
      );
    const evidence = JSON.stringify(source);
    const numericValues = new Set<string>();
    const collectNumbers = (value: unknown) => {
      if (typeof value === "number") numericValues.add(String(value));
      else if (value && typeof value === "object")
        Object.values(value).forEach(collectNumbers);
    };
    collectNumbers(source);
    let url =
      item.url && evidence.includes(item.url) && /^https:\/\//.test(item.url)
        ? item.url
        : undefined;
    if (!url && data.toolkit === "web" && typeof source.url === "string" && source.url.startsWith("https://")) url = source.url;
    if (
      !url &&
      data.toolkit === "gmail" &&
      /^[a-f0-9]{10,30}$/i.test(item.sourceId)
    )
      url = `https://mail.google.com/mail/u/0/#all/${item.sourceId}`;
    if (
      !url &&
      ["twitter", "x"].includes(data.toolkit) &&
      /^\d{10,25}$/.test(item.sourceId)
    )
      url = `https://x.com/i/status/${item.sourceId}`;
    const listing = data.toolkit === "web" ? extractedProduct.safeParse(source.product) : undefined;
    const seller = url ? trustedRetailer(url) : undefined;
    const product = listing?.success && seller && typeof source.observedAt === "string"
      ? { ...listing.data, imageUrl: listing.data.imageUrl?.startsWith("https://") ? listing.data.imageUrl : null, seller, observedAt: source.observedAt }
      : undefined;
    return {
      ...item,
      url,
      product,
      title: product && typeof source.title === "string" ? source.title : item.title,
      metrics: item.metrics?.filter((metric) => {
        const numbers = metric.match(/\d[\d,.]*/g);
        return (
          numbers?.every((number) =>
            numericValues.has(number.replace(/,/g, "")),
          ) ?? false
        );
      }),
    };
  });
}
export function fallbackItems(
  toolkit: string,
  sources: Map<string, Record<string, unknown>>,
): NonNullable<WorkflowCard["items"]> {
  const items: NonNullable<WorkflowCard["items"]> = [];
  const seen = new Set<Record<string, unknown>>();
  const string = (value: unknown) =>
    typeof value === "string" ? value : undefined;
  for (const [sourceId, record] of sources) {
    if (seen.has(record)) continue;
    seen.add(record);
    const title =
      string(record.subject) ??
      string(record.text) ??
      string(record.title) ??
      string(record.name);
    if (toolkit === "gmail" && !string(record.subject)) continue;
    if (["twitter", "x"].includes(toolkit) && !string(record.text)) continue;
    if (!title) continue;
    const preview =
      string(record.snippet) ??
      string(record.preview) ??
      string(record.messageText) ??
      string(record.detail) ??
      string(record.body);
    const subtitle = [
      string(record.sender) ?? string(record.from),
      string(record.messageTimestamp) ?? string(record.created_at),
    ]
      .filter(Boolean)
      .join(" · ");
    const engagement = (record.public_metrics ?? record) as Record<
      string,
      unknown
    >;
    const metrics = [
      ["Likes", engagement.like_count ?? engagement.favorite_count],
      ["Reposts", engagement.retweet_count ?? engagement.repost_count],
    ].flatMap(([label, count]) =>
      typeof count === "number"
        ? [`${count.toLocaleString("en-US")} ${label}`]
        : [],
    );
    items.push({
      sourceId,
      title: title.slice(0, 200),
      preview: preview?.slice(0, 700),
      subtitle,
      metrics,
      url: string(record.url) ?? string(record.html_url),
    });
    if (items.length === 5) break;
  }
  return groundedItems(
    { toolkit, title: "", summary: "", items, followUps: [] },
    sources,
  );
}
