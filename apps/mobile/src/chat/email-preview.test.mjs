import assert from "node:assert/strict";
import { test } from "node:test";
import { emailPreview, emailSubtitle } from "./email-preview.ts";

test("extracts readable email text without styles, comments or tracking links", () => {
  assert.equal(emailPreview('<!doctype html><html><head><style>body { color:red }</style></head><body><!--[if mso]>junk<![endif]--><p>Hello&nbsp;Sam &amp; team</p><a href="https://tracking.example">Review draft</a></body></html>'), "Hello Sam & team Review draft");
});
test("hides encoded blobs and normalizes older plain previews", () => {
  assert.equal(emailPreview("Update\n\n" + "A".repeat(160) + " https://tracking.example/token\nReady"), "Update Ready");
  assert.equal(emailPreview(undefined), "");
  assert.equal(emailPreview("3 changes ready."), "3 changes ready.");
});
test("keeps readable sender identity and replaces raw ISO dates", () => {
  const result = emailSubtitle("Claude <no-reply@example.com> · 2026-11-23T17:24:14Z");
  assert.ok(result.startsWith("Claude · "));
  assert.ok(!result.includes("T17:"));
});

test("recognizes historical emails incorrectly labelled as calendar results", async () => {
  const { isEmailResult } = await import("./email-preview.ts");
  const emails = [
    { sourceId: "abcdef123456", subtitle: "Sender <sender@example.com>" },
    { sourceId: "abcdef123457", subtitle: "Someone <someone@example.com>" },
  ];
  assert.equal(isEmailResult("googlecalendar", emails), true);
  assert.equal(isEmailResult("googlecalendar", [{ sourceId: "calendar-event-id", subtitle: "Person <person@example.com>" }]), false);
  assert.equal(isEmailResult("googlecalendar", [{ sourceId: "abcdef123456" }]), false);
});

test("does not show CSS from an old preview truncated inside the HTML head", () => {
  assert.equal(emailPreview('<!doctype html><html><head><title></title><style>body { margin: 0; color: red;'), "");
});
