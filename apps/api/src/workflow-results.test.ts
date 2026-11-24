import { describe, expect, it } from "vitest";
import { appSourceGroups, fallbackItems } from "./workflow-results.js";

describe("fallback email results", () => {
  it("cleans a long HTML head before truncating the preview", () => {
    const record = { id: "abcdef123456", subject: "Review the draft", body: '<html><head><style>' + "body{color:red}".repeat(200) + '</style></head><body>Hi Sam &amp; team. Review the draft.</body></html>' };
    const items = fallbackItems("gmail", new Map([[record.id, record]]));
    expect(items[0]?.preview).toBe("Hi Sam & team. Review the draft.");
    expect(items[0]?.url).toBe("https://mail.google.com/mail/#all/abcdef123456");
  });
  it("omits connector schema placeholders", () => {
    expect(fallbackItems("gmail", new Map([["string", { id: "string", subject: "string", body: "string" }]]))).toEqual([]);
  });
});


describe("mixed app source attribution", () => {
  it("keeps email evidence out of calendar results", () => {
    const calendar = { tool_slug: "GOOGLECALENDAR_EVENTS_LIST", data: { id: "event-1" } };
    const email = { tool_slug: "GMAIL_FETCH_EMAILS", data: { id: "abcdef123456" } };
    expect(appSourceGroups(["GOOGLECALENDAR_EVENTS_LIST", "GMAIL_FETCH_EMAILS"], { data: { results: [email, calendar] } })).toEqual([
      { toolkit: "gmail", result: email },
      { toolkit: "googlecalendar", result: calendar },
    ]);
  });
  it("does not guess provenance for an unpartitioned mixed response", () => {
    expect(appSourceGroups(["GOOGLECALENDAR_EVENTS_LIST", "GMAIL_FETCH_EMAILS"], { data: { id: "unknown" } })).toEqual([]);
  });
  it("preserves single-app responses and positional mixed batches", () => {
    expect(appSourceGroups(["GMAIL_FETCH_EMAILS"], { data: [] })).toEqual([{ toolkit: "gmail", result: { data: [] } }]);
    expect(appSourceGroups(["GMAIL_FETCH_EMAILS", "GOOGLECALENDAR_EVENTS_LIST"], { data: { results: ["mail", "event"] } })).toEqual([
      { toolkit: "gmail", result: "mail" }, { toolkit: "googlecalendar", result: "event" },
    ]);
  });
});
