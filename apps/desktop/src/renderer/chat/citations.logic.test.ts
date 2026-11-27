import assert from "node:assert/strict";
import { test } from "node:test";
import { citationFor, linkCitations, sourcesOf } from "./citations.logic.ts";

const sources = [
  { id: "s1", url: "https://lonelyplanet.com/ghana/kumasi", title: "Kumasi guide", domain: "lonelyplanet.com" },
  { id: "s2", url: "https://booking.com/kumasi/", title: "Hostels in Kumasi", domain: "booking.com" },
];

test("a saved reply's ids become the same links a live reply gets", () => {
  assert.equal(linkCitations("Kejetia is open late [s1].", sources), "Kejetia is open late [lonelyplanet.com](https://lonelyplanet.com/ghana/kumasi).");
  assert.equal(linkCitations("Hostels start at GH¢150[s2][s1]", sources), "Hostels start at GH¢150 [booking.com](https://booking.com/kumasi/) [lonelyplanet.com](https://lonelyplanet.com/ghana/kumasi)");
});

test("a repeated id shows once, and an id with no page is dropped", () => {
  assert.equal(linkCitations("Cheap [s1][s1]", sources), "Cheap [lonelyplanet.com](https://lonelyplanet.com/ghana/kumasi)");
  assert.equal(linkCitations("Unknown [s9] here", sources), "Unknown  here");
  assert.equal(linkCitations("Mixed [s9][s2]", sources), "Mixed [booking.com](https://booking.com/kumasi/)");
});

test("text without citations, or a reply without sources, stays as it is", () => {
  assert.equal(linkCitations("No citations [here]", sources), "No citations [here]");
  assert.equal(linkCitations("Keep [s1]", []), "Keep [s1]");
});

test("a link to one of the reply's pages is a citation, however the URL ends", () => {
  assert.equal(citationFor("https://booking.com/kumasi", sources)?.id, "s2");
  assert.equal(citationFor("https://lonelyplanet.com/ghana/kumasi/#top", sources)?.id, "s1");
  assert.equal(citationFor("https://example.com", sources), null);
  assert.equal(citationFor(undefined, sources), null);
});

test("a row's sources come from its sources cards", () => {
  assert.deepEqual(sourcesOf([{ type: "activity" }, { type: "sources", sources } as { type: string }]).map((source) => source.id), ["s1", "s2"]);
  assert.deepEqual(sourcesOf(undefined), []);
});
