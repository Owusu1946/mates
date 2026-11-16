import assert from "node:assert/strict";
import { test } from "node:test";
import { hrefOf, linkify } from "./links.ts";

const links = (text) => linkify(text).filter((s) => s.url).map((s) => [s.text, s.url]);

test("full URLs, www addresses and bare domains become links", () => {
  assert.deepEqual(links("check https://openrouter.ai/startups please"), [["https://openrouter.ai/startups", "https://openrouter.ai/startups"]]);
  assert.deepEqual(links("go to www.sailrides.co"), [["www.sailrides.co", "https://www.sailrides.co"]]);
  assert.deepEqual(links("our site askorin.app/pricing is live"), [["askorin.app/pricing", "https://askorin.app/pricing"]]);
});

test("the text around a link is kept exactly", () => {
  const segments = linkify("Hi, see askorin.app. Thanks!");
  assert.equal(segments.map((s) => s.text).join(""), "Hi, see askorin.app. Thanks!");
  assert.deepEqual(links("Hi, see askorin.app. Thanks!"), [["askorin.app", "https://askorin.app"]]);
});

test("trailing punctuation stays out, but a link's own brackets stay in", () => {
  assert.deepEqual(links("(see https://example.com/a)"), [["https://example.com/a", "https://example.com/a"]]);
  assert.deepEqual(links("https://en.wikipedia.org/wiki/Accra_(city), ok"), [["https://en.wikipedia.org/wiki/Accra_(city)", "https://en.wikipedia.org/wiki/Accra_(city)"]]);
});

test("emails, versions and plain words are not links", () => {
  assert.deepEqual(links("mail ken@askorin.app now"), []);
  assert.deepEqual(links("version 1.2.3 and e.g. this"), []);
  assert.deepEqual(links("This is abc"), []);
});

test("an address without a scheme opens over https", () => {
  assert.equal(hrefOf("askorin.app"), "https://askorin.app");
  assert.equal(hrefOf("http://x.com"), "http://x.com");
});
