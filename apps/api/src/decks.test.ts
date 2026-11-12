import JSZip from "jszip";
import { afterEach, describe, expect, it, vi } from "vitest";
import { slideContent, type Deck, type Slide } from "@muse-clone/decks";
import { renderPptx } from "./deck-pptx.js";
import { applyChanges, buildDeck, deckCard, deckFilename, modelSchema, sourcesOf, withoutCitationTags, type DeckRow } from "./decks.js";

const gradient: [string, string, string] = ["#b9c8f5", "#5b7be0", "#26408b"];
const slides: Slide[] = [
  { id: "a", notes: "Open warmly.", layout: "title", title: "Pasta Point", subtitle: "Hot pasta, close by" },
  { id: "b", notes: "", layout: "bullets", title: "Why now", bullets: ["Delivery keeps growing", "Pasta travels badly today"] },
  { id: "c", notes: "Point at week 8.", layout: "chart", title: "Weekly bowls", chart: { type: "bar", unit: "bowls", points: [{ label: "Week 2", value: 180 }, { label: "Week 8", value: 470 }] }, takeaway: null, sourceIds: [], fromUser: true },
  { id: "d", notes: "", layout: "closing", title: "Thank you", subtitle: null, contact: "hello@pastapoint.gh" },
];
const deck: Deck = { title: "Pasta Point", theme: { mode: "light", gradient }, slides, sources: [{ id: "s1", title: "statista.com", url: "https://www.statista.com/x" }] };

describe("model schemas", () => {
  it("are strict and leave length limits to the checks after the call", () => {
    const schema = JSON.stringify(modelSchema(slideContent.bullets));
    expect(schema).not.toMatch(/maxLength|minLength|maxItems|minItems|\$schema/);
    expect(schema).toContain('"enum":["bullets"]');
    const parsed = modelSchema(slideContent.closing) as { required: string[]; additionalProperties: boolean };
    expect(parsed.required.sort()).toEqual(["contact", "layout", "subtitle", "title"]);
    expect(parsed.additionalProperties).toBe(false);
  });
});

describe("sources", () => {
  it("numbers each linked fact's site once and skips facts the user gave", () => {
    expect(
      sourcesOf([
        { text: "a", url: "https://www.statista.com/1" },
        { text: "b", url: "https://www.statista.com/1" },
        { text: "c", url: null },
        { text: "d", url: "not a url" },
        { text: "e", url: "https://glovoapp.com/x" },
      ]),
    ).toEqual([
      { id: "s1", title: "statista.com", url: "https://www.statista.com/1" },
      { id: "s2", title: "glovoapp.com", url: "https://glovoapp.com/x" },
    ]);
  });

  it("strips citation tags copied into slide text but keeps sourceIds", () => {
    expect(withoutCitationTags({ body: "Grows to $1.2bn [s1].", points: ["Top 5 dish [s2, s3]"], sourceIds: ["s1"], note: "Keep [brackets]" })).toEqual({
      body: "Grows to $1.2bn.",
      points: ["Top 5 dish"],
      sourceIds: ["s1"],
      note: "Keep [brackets]",
    });
  });
});

describe("edits", () => {
  const bullets = (title: string): Slide => ({ id: "new", notes: "", layout: "bullets", title, bullets: ["One", "Two"] });

  it("only touch the slides they're allowed to", () => {
    const next = applyChanges(slides, [
      { action: "replace", slide: "b", after: null, content: bullets("Why now, shorter") },
      { action: "replace", slide: "c", after: null, content: bullets("Not allowed") },
      { action: "delete", slide: "a", after: null, content: null },
    ], new Set(["b"]));
    expect(next.map((s) => s.id)).toEqual(["a", "b", "c", "d"]);
    expect(next[1]).toMatchObject({ id: "b", title: "Why now, shorter" });
    expect(next[2]).toEqual(slides[2]);
  });

  it("insert, delete and move slides when the change is deck-wide", () => {
    const next = applyChanges(slides, [
      { action: "insert_after", slide: "start", after: null, content: bullets("Agenda") },
      { action: "delete", slide: "b", after: null, content: null },
      { action: "move_after", slide: "d", after: "a", content: null },
    ], null);
    expect(next.map((s) => ("title" in s ? s.title : ""))).toEqual(["Agenda", "Pasta Point", "Thank you", "Weekly bowls"]);
    expect(new Set(next.map((s) => s.id)).size).toBe(next.length);
    expect(slides).toHaveLength(4); // the original is untouched
  });
});

describe("the card and the download", () => {
  it("shows progress while building and the slide list when ready", () => {
    const row = { id: "deck-1", title: "Pasta Point", status: "writing", built: 2, total: 4, version: 0, slides: slides.slice(0, 2), error: null } as unknown as DeckRow;
    expect(deckCard(row)).toMatchObject({ kind: "deck", phase: "running", deck: { built: 2, total: 4, slides: [{ id: "a", title: "Pasta Point" }, { id: "b", title: "Why now" }] } });
    expect(deckCard({ ...row, status: "ready" }).phase).toBe("done");
    expect(deckCard({ ...row, status: "failed", error: "No luck" }).deck).toMatchObject({ error: "No luck" });
  });

  it("names the file after the deck, safely", () => {
    expect(deckFilename("Q3 review: support / “wins”")).toBe(`attachment; filename="deck.pptx"; filename*=UTF-8''Q3%20review%20support%20wins.pptx`);
    expect(deckFilename("***")).toContain("Deck.pptx");
  });
});

describe("PowerPoint export", () => {
  it("writes a 16:9 deck with every slide, notes, a native chart and a sources slide", async () => {
    const zip = await JSZip.loadAsync(await renderPptx(deck));
    const files = Object.keys(zip.files);
    expect(files.filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))).toHaveLength(slides.length + 1);
    expect(files.some((f) => /^ppt\/charts\/chart\d+\.xml$/.test(f))).toBe(true);
    const presentation = await zip.file("ppt/presentation.xml")!.async("string");
    expect(presentation).toContain('cx="12192000" cy="6858000"');
    const notes = await Promise.all(files.filter((f) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(f)).map((f) => zip.file(f)!.async("string")));
    expect(notes.join()).toContain("Point at week 8.");
    const last = await zip.file(`ppt/slides/slide${slides.length + 1}.xml`)!.async("string");
    expect(last).toContain("Sources");
    expect(last).toContain("statista.com");
  });
});

describe("building a deck", () => {
  afterEach(() => vi.unstubAllGlobals());

  /** A model that answers from a queue, recording each request. */
  const fakeModel = (answers: unknown[]) => {
    const requests: { model: string; messages: { content: string }[]; response_format: { json_schema: { name: string } } }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: { body: string }) => {
      requests.push(JSON.parse(init.body));
      const next = answers.shift();
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(next) } }], usage: { cost: 0.001 } }), { status: 200 });
    }));
    return requests;
  };

  it("plans, writes each slide, repairs a broken one and adds up the cost", async () => {
    const requests = fakeModel([
      { title: "Pasta Point", mode: "dark", slides: [{ layout: "title", title: "Pasta Point", intent: "open", sourceIds: [], fromUser: false }, { layout: "big-number", title: "Big market", intent: "size", sourceIds: ["s1"], fromUser: false }, { layout: "closing", title: "Thanks", intent: "close", sourceIds: [], fromUser: false }] },
      { layout: "title", title: "Pasta Point", subtitle: "Hot pasta [s1]", notes: "Hello." },
      // Unsourced figure: sent back once with the problem, then fixed.
      { layout: "big-number", title: "Big market", value: "$1.2bn", label: "delivery revenue", context: null, sourceIds: [], fromUser: false, notes: "" },
      { layout: "closing", title: "Thanks", subtitle: null, contact: null, notes: "" },
      { layout: "big-number", title: "Big market", value: "$1.2bn", label: "delivery revenue", context: null, sourceIds: ["s1"], fromUser: false, notes: "" },
    ]);
    const progress: number[] = [];
    const { deck: built, cost } = await buildDeck(
      { topic: "Pitch", audience: null, slideCount: 3, facts: [{ text: "Delivery is $1.2bn", url: "https://www.statista.com/x" }] },
      { mode: "light", gradient },
      [{ id: "s1", title: "statista.com", url: "https://www.statista.com/x" }],
      { signal: new AbortController().signal, onSlides: async (s) => void progress.push(s.length) },
    );
    expect(built.slides.map((s) => s.layout)).toEqual(["title", "big-number", "closing"]);
    expect(built.slides[0]).toMatchObject({ subtitle: "Hot pasta" });
    expect(built.slides[1]).toMatchObject({ sourceIds: ["s1"] });
    expect(built.theme.mode).toBe("dark");
    expect(cost).toBeCloseTo(0.005);
    // Each report carries the latest slides, so counts only grow and end at the full deck.
    expect(progress).toEqual([...progress].sort((x, y) => x - y));
    expect(progress.at(-1)).toBe(3);
    expect(requests.at(-1)!.messages.at(-1)!.content).toMatch(/broke these rules/);
    // Every slide call shares the same system prompt, so the provider can cache it.
    const systems = new Set(requests.slice(1).map((r) => r.messages[0]!.content));
    expect(systems.size).toBe(1);
  });

  it("falls back to plain bullets when a slide can't be fixed", async () => {
    const tooLong = "x".repeat(200);
    fakeModel([
      { title: "T", mode: "light", slides: [{ layout: "title", title: "T", intent: "open", sourceIds: [], fromUser: false }, { layout: "quote", title: "Q", intent: "quote", sourceIds: [], fromUser: false }, { layout: "closing", title: "End", intent: "close", sourceIds: [], fromUser: false }] },
      { layout: "title", title: "T", subtitle: null, notes: "" },
      { layout: "quote", quote: tooLong + tooLong, attribution: null, notes: "" },
      { layout: "closing", title: "End", subtitle: null, contact: null, notes: "" },
      { layout: "quote", quote: tooLong + tooLong, attribution: null, notes: "" },
      { layout: "bullets", title: "A point", bullets: ["One", "Two"], notes: "" },
    ]);
    const { deck: built } = await buildDeck({ topic: "T", audience: null, slideCount: 3, facts: [] }, { mode: "light", gradient }, [], { signal: new AbortController().signal });
    expect(built.slides.map((s) => s.layout)).toEqual(["title", "bullets", "closing"]);
  });
});
