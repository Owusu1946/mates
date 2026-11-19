import { describe, expect, it } from "vitest";
import { canAlwaysAllow, categoryOf, decide, grantKey, grantLabel, targetsOf } from "./permissions.js";

describe("what an action does", () => {
  it("names money, deletes, shares, sends, drafts and changes from the slug", () => {
    expect(categoryOf("STRIPE_CREATE_PAYMENT_INTENT")).toBe("spend");
    expect(categoryOf("PAYSTACK_INITIATE_TRANSFER")).toBe("spend");
    expect(categoryOf("SHOPIFY_PURCHASE_ITEM")).toBe("spend");
    expect(categoryOf("GMAIL_DELETE_MESSAGE")).toBe("delete");
    expect(categoryOf("GOOGLEDRIVE_PERMANENTLY_DELETE_FILE")).toBe("delete");
    expect(categoryOf("GOOGLEDRIVE_ADD_PERMISSION")).toBe("share");
    expect(categoryOf("SLACK_INVITE_USER_TO_CHANNEL")).toBe("share");
    expect(categoryOf("GMAIL_SEND_EMAIL")).toBe("send");
    expect(categoryOf("GMAIL_REPLY_TO_THREAD")).toBe("send");
    expect(categoryOf("SLACK_SEND_MESSAGE")).toBe("send");
    expect(categoryOf("GMAIL_CREATE_EMAIL_DRAFT")).toBe("draft");
    expect(categoryOf("GMAIL_FETCH_EMAILS")).toBe("read");
    expect(categoryOf("NOTION_CREATE_PAGE")).toBe("change");
  });

  it("keeps trash and archive as ordinary changes: only what can't be undone counts as a delete", () => {
    expect(categoryOf("GMAIL_MOVE_TO_TRASH")).toBe("change");
    expect(categoryOf("GMAIL_ARCHIVE_EMAIL")).toBe("change");
  });

  it("treats a calendar event as an invite only when it has guests", () => {
    expect(categoryOf("GOOGLECALENDAR_CREATE_EVENT", { summary: "Focus" })).toBe("change");
    expect(categoryOf("GOOGLECALENDAR_CREATE_EVENT", { attendees: [{ email: "ama@x.com" }] })).toBe("share");
  });
});

describe("who an action reaches", () => {
  it("reads emails, phone numbers and channels, lower-cased and de-duplicated", () => {
    expect(targetsOf("GMAIL_SEND_EMAIL", { recipient_email: "Ama@X.com", cc: "Kofi <kofi@y.com>, ama@x.com" })).toEqual(["ama@x.com", "kofi@y.com"]);
    expect(targetsOf("GOOGLECALENDAR_CREATE_EVENT", { attendees: [{ email: "esi@z.com" }, "kwame@z.com"] })).toEqual(["esi@z.com", "kwame@z.com"]);
    expect(targetsOf("TWILIO_SEND_SMS", { to_number: "+233200000000" })).toEqual(["+233200000000"]);
    expect(targetsOf("NOTION_CREATE_PAGE", { title: "Notes" })).toEqual([]);
  });
});

describe("act or ask", () => {
  const base = { toolkit: "gmail", self: new Set(["ken@me.com"]), allowed: new Set<string>() };

  it("in chat, acts on what you asked for, except money and permanent deletes", () => {
    expect(decide({ ...base, category: "send", targets: ["ama@x.com"], origin: "chat" }).decision).toBe("act");
    expect(decide({ ...base, category: "share", targets: ["ama@x.com"], origin: "chat" }).decision).toBe("act");
    expect(decide({ ...base, category: "change", targets: [], origin: "chat" }).decision).toBe("act");
    expect(decide({ ...base, category: "delete", targets: [], origin: "chat" }).decision).toBe("ask");
    expect(decide({ ...base, toolkit: "stripe", category: "spend", targets: [], origin: "chat" }).decision).toBe("ask");
  });

  it("while you're away, asks before reaching anyone else", () => {
    expect(decide({ ...base, category: "send", targets: ["ama@x.com"], origin: "unattended" }).decision).toBe("ask");
    expect(decide({ ...base, category: "share", targets: ["ama@x.com"], origin: "unattended" }).decision).toBe("ask");
    expect(decide({ ...base, category: "change", targets: [], origin: "unattended" }).decision).toBe("act");
    expect(decide({ ...base, category: "draft", targets: ["ama@x.com"], origin: "unattended" }).decision).toBe("act");
  });

  it("never asks before mail to yourself", () => {
    expect(decide({ ...base, category: "send", targets: ["ken@me.com"], origin: "unattended" }).decision).toBe("act");
    // Yourself plus someone else still asks, for the someone else only.
    const mixed = decide({ ...base, category: "send", targets: ["ken@me.com", "ama@x.com"], origin: "unattended" });
    expect(mixed).toEqual({ decision: "ask", keys: [grantKey("send", "gmail", "ama@x.com")] });
  });

  it("an always-allow covers that exact app and person, and every person must be covered", () => {
    const allowed = new Set([grantKey("send", "gmail", "ama@x.com")]);
    expect(decide({ ...base, allowed, category: "send", targets: ["ama@x.com"], origin: "unattended" }).decision).toBe("act");
    expect(decide({ ...base, allowed, category: "send", targets: ["ama@y.com"], origin: "unattended" }).decision).toBe("ask");
    expect(decide({ ...base, allowed, category: "send", targets: ["ama@x.com", "kofi@y.com"], origin: "unattended" }).decision).toBe("ask");
    expect(decide({ ...base, allowed, toolkit: "slack", category: "send", targets: ["ama@x.com"], origin: "unattended" }).decision).toBe("ask");
    expect(decide({ ...base, allowed, category: "share", targets: ["ama@x.com"], origin: "unattended" }).decision).toBe("ask");
  });

  it("never offers always-allow for money", () => {
    expect(canAlwaysAllow(["send", "share"])).toBe(true);
    expect(canAlwaysAllow(["send", "spend"])).toBe(false);
  });

  it("labels a grant in plain words", () => {
    expect(grantLabel("send", "Gmail", "ama@x.com")).toBe("Send messages to ama@x.com in Gmail");
    expect(grantLabel("delete", "Notion", "")).toBe("Delete in Notion");
  });
});
