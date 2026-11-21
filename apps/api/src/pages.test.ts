import { afterEach, describe, expect, it, vi } from "vitest";
import type { PageDoc } from "@muse-clone/pages";
import { modelSchema } from "./decks.js";
import { applyPageChanges, buildPage, newSlug, pageCard, relevantBlocks, withoutCitationTags, type PageRow } from "./pages.js";

const doc: PageDoc = {
  title: "Kumasi weekend",
  subtitle: null,
  emoji: "🧳",
  theme: "warm",
  sources: [{ id: "s1", title: "stc.example.com", url: "https://stc.example.com" }],
  sections: [
    { id: "s_plan", heading: "The plan", blocks: [
      { id: "b_t", type: "timeline", steps: [{ when: "Fri 6:00", title: "Bus from Accra", text: null }, { when: "Fri 19:00", title: "Dinner at Moti Mahal", text: null }] },
      { id: "b_x", type: "text", text: "Meet at Circle.", cites: [] },
    ] },
    { id: "s_pack", heading: "Packing", blocks: [{ id: "b_c", type: "checklist", items: [{ text: "Ghana Card", done: false }] }] },
  ],
};

describe("slugs", () => {
  it("are twelve unambiguous characters", () => {
    for (let i = 0; i < 50; i++) expect(newSlug()).toMatch(/^[a-hjkmnp-z2-9]{12}$/);
  });
});

describe("applying changes", () => {
  it("replaces a block in place and keeps its id", () => {
    const next = applyPageChanges(doc, [{ action: "replace_block", target: "b_t", after: null, heading: null, blocks: null, block: { type: "timeline", steps: [{ when: "Fri 6:00", title: "Bus from Accra", text: null }, { when: "Fri 20:00", title: "Dinner at Moti Mahal", text: null }] } }]);
    expect(next.sections[0]!.blocks[0]).toMatchObject({ id: "b_t", steps: [{}, { when: "Fri 20:00" }] });
  });

  it("inserts at the start of a section, moves and deletes blocks, and adds, renames and drops sections", () => {
    const next = applyPageChanges(doc, [
      { action: "insert_block_after", target: "section:s_pack", after: null, heading: null, blocks: null, block: { type: "callout", tone: "tip", title: null, text: "Bring cash", } },
      { action: "move_block_after", target: "b_x", after: "section:s_pack", heading: null, blocks: null, block: null },
      { action: "rename_section", target: "s_pack", after: null, heading: "What to bring", blocks: null, block: null },
      { action: "add_section_after", target: "start", after: null, heading: "At a glance", block: null, blocks: [{ type: "text", text: "Three days.", cites: [] }] },
      { action: "delete_block", target: "missing", after: null, heading: null, blocks: null, block: null },
    ]);
    expect(next.sections.map((s) => s.heading)).toEqual(["At a glance", "The plan", "What to bring"]);
    expect(next.sections[2]!.blocks.map((b) => b.type)).toEqual(["text", "callout", "checklist"]);
    expect(next.sections[0]!.blocks[0]!.id).toMatch(/^b[0-9a-f]{6}$/);
    expect(applyPageChanges(doc, [{ action: "delete_section", target: "s_plan", after: null, heading: null, blocks: null, block: null }]).sections).toHaveLength(1);
  });

  it("drops a section left with no blocks", () => {
    const next = applyPageChanges(doc, [{ action: "delete_block", target: "b_c", after: null, heading: null, blocks: null, block: null }]);
    expect(next.sections.map((s) => s.id)).toEqual(["s_plan"]);
  });
});

describe("what an edit sees", () => {
  it("sends a small page whole, and only matching blocks from a big one", () => {
    expect(relevantBlocks(doc, "move dinner to 8")).toHaveLength(3);
    const big: PageDoc = { ...doc, sections: Array.from({ length: 6 }, (_, s) => ({ id: `s${s}`, heading: `Day ${s + 1}`, blocks: Array.from({ length: 4 }, (_, b) => ({ id: `b${s}${b}`, type: "text" as const, text: s === 3 && b === 2 ? "Dinner at Moti Mahal" : `Plan ${s}.${b}`, cites: [] })) })) };
    expect(relevantBlocks(big, "move dinner to 8pm").map((b) => b.id)).toEqual(["b32"]);
  });
});

describe("citation tags", () => {
  it("are taken out of text but kept in cites", () => {
    expect(withoutCitationTags({ text: "GH¢180 each [s1]", cites: ["s1"] })).toEqual({ text: "GH¢180 each", cites: ["s1"] });
  });
});

describe("the card", () => {
  it("shows progress, sections and the link only when shared", () => {
    const row = { id: "p1", title: "Kumasi weekend", status: "ready", built: 2, total: 2, version: 3, visibility: "private", slug: "abcdefghjkmn", summary: "Moved dinner to 8pm", doc, error: null, updatedAt: new Date(0) } as unknown as PageRow;
    expect(pageCard(row).page).toMatchObject({ sections: ["The plan", "Packing"], shared: false, summary: "Moved dinner to 8pm", emoji: "🧳" });
    expect(pageCard(row).page?.url).toBeUndefined();
    expect(pageCard({ ...row, visibility: "link" } as PageRow).page?.url).toBe("https://pages.askorin.app/abcdefghjkmn");
  });
});

describe("building a page", () => {
  afterEach(() => vi.unstubAllGlobals());

  const fakeModel = (answers: unknown[]) => {
    const requests: { messages: { content: string }[]; response_format: { json_schema: { name: string; schema: unknown } } }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: { body: string }) => {
      requests.push(JSON.parse(init.body));
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(answers.shift()) } }], usage: { cost: 0.001 } }), { status: 200 });
    }));
    return requests;
  };

  it("plans, writes sections in parallel, repairs a broken block and drops what can't be fixed", async () => {
    const requests = fakeModel([
      { title: "Kumasi weekend", subtitle: "Three days", emoji: "🧳", theme: "warm", sections: [{ heading: "The plan", intent: "schedule", blocks: ["timeline"] }, { heading: "Budget", intent: "costs", blocks: ["table"] }] },
      { blocks: [{ type: "timeline", steps: [{ when: "Fri 6:00", title: "Bus [s1]", text: null }, { when: "Fri 13:00", title: "Palace", text: null }] }] },
      // A ragged table and a citation to a source that doesn't exist: sent back once.
      { blocks: [{ type: "table", caption: null, columns: ["Item", "Cost"], rows: [["Bus"]], totals: false, cites: ["s9"] }] },
      { blocks: [{ type: "table", caption: null, columns: ["Item", "Cost"], rows: [["Bus", "GH¢180"]], totals: false, cites: ["s1"] }] },
    ]);
    const sections: number[] = [];
    const { doc: built, cost } = await buildPage(
      { kind: "trip", topic: "Kumasi trip", audience: null, facts: [{ text: "STC bus GH¢180", url: "https://stc.example.com" }] },
      [{ id: "s1", title: "stc.example.com", url: "https://stc.example.com" }],
      { signal: new AbortController().signal, onSections: async (d) => void sections.push(d.sections.length) },
    );
    expect(built.sections.map((s) => s.heading)).toEqual(["The plan", "Budget"]);
    expect(built.sections[0]!.blocks[0]).toMatchObject({ steps: [{ title: "Bus" }, {}] });
    expect(built.sections[1]!.blocks[0]).toMatchObject({ rows: [["Bus", "GH¢180"]], cites: ["s1"] });
    expect(built.theme).toBe("warm");
    expect(cost).toBeCloseTo(0.004);
    expect(sections.at(-1)).toBe(2);
    // Sections share everything up front so the provider caches it.
    expect(requests[1]!.messages[0]!.content).toBe(requests[2]!.messages[0]!.content);
  });

  it("asks the model for strict JSON it can actually produce", async () => {
    const requests = fakeModel([
      { title: "List", subtitle: null, emoji: null, theme: "paper", sections: [{ heading: "Groceries", intent: "list", blocks: ["checklist"] }] },
      { blocks: [{ type: "checklist", items: [{ text: "Rice", done: false }] }] },
    ]);
    await buildPage({ kind: "list", topic: "Shopping", audience: null, facts: [] }, [], { signal: new AbortController().signal });
    const schema = JSON.stringify(requests[1]!.response_format.json_schema.schema);
    expect(schema).not.toMatch(/maxLength|minItems|\$schema/);
    expect(schema).toContain('"enum":["checklist"]');
    expect(JSON.stringify(modelSchema(await import("zod").then(({ z }) => z.object({ a: z.string().max(3) }))))).not.toContain("maxLength");
  });
});

describe("routing a request for a page", () => {
  it("makes a Mates page, never another app's page, unless the user names the app", async () => {
    const { pageInstructions, pagesOffInstructions } = await import("./pages.js");
    expect(pageInstructions).toContain("cooper_create_page");
    expect(pageInstructions).toMatch(/Never make it in WordPress, Notion/);
    expect(pageInstructions).toMatch(/never ask the user to connect an app for it, unless they name that app/);
    // While Pages is off the tool isn't offered, so the instructions mustn't name it.
    expect(pagesOffInstructions).not.toContain("cooper_create_page");
    expect(pagesOffInstructions).toMatch(/only if the user names that app/);
  });
});
