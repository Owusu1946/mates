import { afterEach, describe, expect, it, vi } from "vitest";
import { citeLinks, cleanUrl, executeWebTool, forcedSearch, searchRequest, SourceLedger, sourcesCard } from "./web-search.js";

const NOW = new Date("2026-11-07T12:00:00Z");

describe("web search", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("forces a search for @Web and hides the tag from the model", () => {
    expect(forcedSearch("@Web best phones 2026")).toEqual({ forced: true, text: "best phones 2026" });
    expect(forcedSearch("what is new @web today")).toEqual({ forced: true, text: "what is new today" });
    expect(forcedSearch("email me@website.com")).toEqual({ forced: false, text: "email me@website.com" });
    expect(forcedSearch("write a poem").forced).toBe(false);
  });

  it("maps depth and freshness onto Parallel's request", () => {
    const quick = searchRequest({ objective: "Zanzibar weather in December", queries: ["zanzibar december weather"], depth: "quick", freshness: "any" }, { sessionId: "run-1", now: NOW });
    expect(quick).toMatchObject({ mode: "fast", search_queries: ["zanzibar december weather"], session_id: "run-1", advanced_settings: { max_results: 8 } });
    expect(quick.advanced_settings).not.toHaveProperty("source_policy");
    const deep = searchRequest({ objective: "Latest phones", queries: ["best phones 2026", "phone reviews november"], depth: "thorough", freshness: "recent" }, { sessionId: "run-1", now: NOW });
    expect(deep).toMatchObject({ mode: "advanced", advanced_settings: { source_policy: { after_date: "2026-10-08" } } });
  });

  it("gives each page one stable id, without tracking parameters", () => {
    expect(cleanUrl("https://www.example.com/a?utm_source=x&id=2#top")).toBe("https://www.example.com/a?id=2");
    expect(cleanUrl("javascript:alert(1)")).toBeNull();
    const ledger = new SourceLedger();
    const first = ledger.add([
      { url: "https://www.lonelyplanet.com/zanzibar?utm_medium=x", title: "Zanzibar guide", publish_date: "2026-10-01", excerpts: ["Dry season…"] },
      { url: "https://weather.com/z", title: "", excerpts: [] },
      { url: "not a url" },
    ]);
    expect(first.map((s) => [s.id, s.domain, s.title])).toEqual([
      ["s1", "lonelyplanet.com", "Zanzibar guide"],
      ["s2", "weather.com", "weather.com"],
    ]);
    const again = ledger.add([{ url: "https://www.lonelyplanet.com/zanzibar", excerpts: ["Hot and humid."] }]);
    expect(again[0]!.id).toBe("s1");
    expect(again[0]!.excerpts).toEqual(["Dry season…", "Hot and humid."]);
    expect(ledger.size).toBe(2);
  });

  it("shows cited sources first, in citation order", () => {
    const ledger = new SourceLedger();
    ledger.add([{ url: "https://a.com" }, { url: "https://b.com" }, { url: "https://c.com" }]);
    expect(ledger.forAnswer("It rains [s3], mostly in April [s1][s3].").map((s) => s.id)).toEqual(["s3", "s1"]);
    expect(ledger.forAnswer("No citations.").map((s) => s.id)).toEqual(["s1", "s2", "s3"]);
    const card = sourcesCard(ledger.forAnswer("[s2]"));
    expect(card).toMatchObject({ kind: "sources", label: "1 source", sources: [{ id: "s2", domain: "b.com" }] });
    expect(card.sources![0]!.favicon).toContain("b.com");
  });

  it("searches, reports each query as a step, and returns ids the model can cite", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ results: [{ url: "https://a.com/x", title: "A", excerpts: ["Fact."] }] }), { status: 200 })));
    const steps: string[] = [];
    const ledger = new SourceLedger();
    const result = await executeWebTool("web_search", { objective: "Find a fact", queries: ["fact one", "fact two"] }, { ledger, sessionId: "run", signal: new AbortController().signal, step: (s) => steps.push(s) });
    expect(steps).toEqual(["Searching for “fact one”", "Searching for “fact two”", "Reading 1 source"]);
    expect(result).toEqual({ results: [{ id: "s1", title: "A", url: "https://a.com/x", published: null, excerpts: ["Fact."] }] });
  });

  it("turns a failed search into a note instead of an error, after one retry on a server error", async () => {
    const fetchMock = vi.fn(async () => new Response("down", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await executeWebTool("web_search", { objective: "Find a fact", queries: ["fact"] }, { ledger: new SourceLedger(), sessionId: "run", signal: new AbortController().signal, step: () => {} });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ results: [], error: expect.stringContaining("unavailable") });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("bad", { status: 422 })));
    const rejected = await executeWebTool("web_search", { objective: "Find a fact", queries: ["fact"] }, { ledger: new SourceLedger(), sessionId: "run", signal: new AbortController().signal, step: () => {} });
    expect(rejected).toMatchObject({ results: [] });
  });

  it("turns citations into source links, collapsing repeats and dropping unknown ids", () => {
    const ledger = new SourceLedger();
    ledger.add([{ url: "https://www.lonelyplanet.com/zanzibar" }, { url: "https://weather.com/z" }]);
    expect(citeLinks("Dry from June [s1][s1][s2]. Rain in April [s9].", ledger)).toBe(
      "Dry from June [lonelyplanet.com](https://www.lonelyplanet.com/zanzibar) [weather.com](https://weather.com/z). Rain in April.",
    );
    expect(citeLinks("No citations here.", ledger)).toBe("No citations here.");
  });
});
