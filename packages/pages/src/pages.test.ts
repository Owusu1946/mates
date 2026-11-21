import { describe, expect, it } from "vitest";
import { contrast } from "@muse-clone/decks";
import {
  accentFor, describePersonal, escape, findPersonal, newPersonal, pageOutline, pageProblems, renderPage, THEME_TOKENS, THEMES, type PageDoc,
} from "./index.js";

const trip: PageDoc = {
  title: "Kumasi weekend",
  subtitle: "Three days, four people, under GH¢3,000",
  emoji: "🧳",
  theme: "paper",
  sources: [{ id: "s1", title: "STC bus fares", url: "https://stc.example.com/fares" }],
  sections: [
    {
      id: "plan",
      heading: "The plan",
      blocks: [
        { id: "b1", type: "timeline", steps: [{ when: "Fri 6am", title: "Bus from Accra", text: "STC, Circle station" }, { when: "Fri 1pm", title: "Manhyia Palace", text: null }] },
        { id: "b2", type: "text", text: "Book the **early** bus. See [STC](https://stc.example.com).", cites: ["s1"] },
      ],
    },
    {
      id: "money",
      heading: "Budget",
      blocks: [
        { id: "b3", type: "table", caption: "Per person", columns: ["Item", "Cost"], rows: [["Bus", "GH¢180"], ["Hotel", "GH¢400"], ["Total", "GH¢580"]], totals: true, cites: ["s1"] },
        { id: "b4", type: "chart", title: "Spend by day", kind: "bar", unit: "GH¢", labels: ["Fri", "Sat", "Sun"], series: [{ name: "Spend", values: [300, 180, 100] }], highlight: 0, cites: [] },
        { id: "b5", type: "checklist", items: [{ text: "Ghana Card", done: false }, { text: "Power bank", done: true }] },
      ],
    },
  ],
};
const options = { mate: { name: "Kofi", color: "#d27e41" }, updatedAt: "2026-11-20T10:00:00Z", summary: "Moved dinner to 8pm", pageKey: "abc", url: "https://pages.askorin.app/abc", now: Date.parse("2026-11-20T12:00:00Z") };

describe("pageProblems", () => {
  it("passes a good page", () => {
    expect(pageProblems(trip)).toEqual([]);
  });

  it("catches what the schema can't: unknown sources, ragged tables, chart shapes, duplicate ids", () => {
    const bad: PageDoc = structuredClone(trip);
    bad.sections[0]!.blocks.push({ id: "b1", type: "text", text: "Again", cites: ["nope"] });
    (bad.sections[1]!.blocks[0] as { rows: string[][] }).rows.push(["Only one"]);
    (bad.sections[1]!.blocks[1] as { series: { name: string; values: number[] }[] }).series[0]!.values = [1, 2];
    const problems = pageProblems(bad).join("\n");
    expect(problems).toMatch(/duplicate id/);
    expect(problems).toMatch(/unknown source "nope"/);
    expect(problems).toMatch(/row 4 has 1 cells for 2 columns/);
    expect(problems).toMatch(/2 values for 3 labels/);
  });
});

describe("renderPage", () => {
  const html = renderPage(trip, options);

  it("is a complete, self-contained document with link-preview tags and noindex", () => {
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain('<meta property="og:title" content="Kumasi weekend">');
    expect(html).toContain('<meta name="robots" content="noindex, nofollow">');
    expect(html).not.toMatch(/<link[^>]+stylesheet|<script src=/);
  });

  it("draws every block: timeline, cited text, totals table, chart, checklist, sources", () => {
    expect(html).toContain('<ol class="timeline">');
    expect(html).toContain("<strong>early</strong>");
    expect(html).toContain('<a href="#source-1">1</a>');
    expect(html).toContain('<tr class="total">');
    expect(html).toContain('<td class="num">GH¢580</td>');
    expect(html).toContain('role="img" aria-label="Spend by day"');
    expect(html).toContain('data-key="abc:b5:1" checked');
    expect(html).toContain('id="source-1"');
    expect(html).toContain("Last edited</span><span class=\"v\">2h ago · Moved dinner to 8pm");
    expect(html).toContain("Made by</span>");
  });

  it("escapes everything from the document, and only links http(s)", () => {
    const hostile: PageDoc = { ...trip, title: '<script>alert("x")</script>', sections: [{ id: "x", heading: "<b>h</b>", blocks: [{ id: "c", type: "text", text: "[click](javascript:alert(1)) <img src=x onerror=alert(1)>", cites: [] }] }], sources: [] };
    const out = renderPage(hostile, options);
    expect(out).not.toContain("<script>alert");
    expect(out).not.toContain("<img src=x");
    expect(out).not.toContain('href="javascript');
    expect(out).toContain("&lt;b&gt;h&lt;/b&gt;");
  });

  it("leaves the footer out in the app", () => {
    expect(renderPage(trip, { ...options, inApp: true })).not.toContain("Get your own mate");
    expect(html).toContain("Get your own mate");
  });

  it("draws every theme, with the mate's colour adjusted until it reads", () => {
    for (const theme of THEMES) {
      const tokens = THEME_TOKENS[theme];
      expect(contrast(tokens.ink, tokens.bg)).toBeGreaterThanOrEqual(7);
      expect(contrast(tokens.muted, tokens.bg)).toBeGreaterThanOrEqual(3.5);
      expect(contrast(accentFor("#fde68a", tokens), tokens.bg)).toBeGreaterThanOrEqual(3);
      expect(renderPage({ ...trip, theme }, options)).toContain(`<meta name="theme-color" content="${tokens.bg}">`);
    }
  });

  it("escapes the five characters that matter", () => {
    expect(escape(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
  });
});

describe("pageOutline", () => {
  it("summarises each block in one line with its id, for edits", () => {
    const outline = pageOutline(trip);
    expect(outline).toContain("[plan] ## The plan");
    expect(outline).toContain("[b3] table 2×3: Per person");
    expect(outline).toContain("[b5] checklist (2, 1 done)");
  });
});

describe("personal data", () => {
  const page = (text: string): PageDoc => ({ ...trip, sections: [{ id: "x", heading: "Notes", blocks: [{ id: "t", type: "text", text, cites: [] }] }], sources: [] });

  it("finds Ghana and international phone numbers, emails, addresses and long numbers", () => {
    const found = findPersonal(page("Call Ama on 024 123 4567 or +44 20 7946 0958. Email ama@example.com. We're at 12 Oxford Street, GA-183-8164. Card 4111 1111 1111 1111. Ghana Card GHA-123456789-0."));
    const kinds = found.map((f) => f.kind);
    expect(kinds.filter((k) => k === "phone")).toHaveLength(2);
    expect(kinds).toContain("email");
    expect(kinds.filter((k) => k === "address").length).toBeGreaterThanOrEqual(2);
    expect(kinds.filter((k) => k === "number").length).toBeGreaterThanOrEqual(2);
  });

  it("finds the owner's friends by name, as whole words", () => {
    expect(findPersonal(page("Dinner with Ama and Kofi"), ["Ama", "Yaw"]).map((f) => f.sample)).toEqual(["Ama"]);
    expect(findPersonal(page("We love Amazing Grace"), ["Ama"])).toEqual([]);
  });

  it("leaves ordinary prices and dates alone", () => {
    expect(findPersonal(page("Bus GH¢180 on 21 Nov 2026, hotel GH¢400 for 2 nights, total GH¢3,000."))).toEqual([]);
  });

  it("says what it found in plain words, and spots what an update added", () => {
    const before = findPersonal(page("Call 024 123 4567"));
    const after = findPersonal(page("Call 024 123 4567, email ama@example.com"));
    expect(describePersonal(after)).toBe("a phone number and an email address");
    expect(describePersonal(newPersonal(before, after))).toBe("an email address");
  });
});

describe("chart units", () => {
  it("puts a currency before the amount, and other units after", () => {
    const donut = (unit: string): PageDoc => ({ ...trip, sources: [], sections: [{ id: "x", heading: "Money", blocks: [{ id: "d", type: "chart", title: "Spend", kind: "donut", unit, labels: ["Bus", "Food"], series: [{ name: "Spend", values: [1440, 400] }], highlight: null, cites: [] }] }] });
    expect(renderPage(donut("GH¢"), options)).toContain("<b>GH¢1,440</b>");
    expect(renderPage(donut("$"), options)).toContain("<b>$1,440</b>");
    expect(renderPage(donut("km"), options)).toContain("<b>1,440 km</b>");
  });
});
