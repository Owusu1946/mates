import { createHmac, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { botRequest, findMeetingLink, isMeetingLink, newPageToken, pageTokenMatches, verifyRecallWebhook } from "./meetings.js";

describe("meeting links", () => {
  it("accepts Google Meet, Zoom and Teams links, and nothing else", () => {
    expect(isMeetingLink("https://meet.google.com/abc-defg-hij")).toBe(true);
    expect(isMeetingLink("https://meet.google.com/abc-defg-hij?authuser=0")).toBe(true);
    expect(isMeetingLink("https://us02web.zoom.us/j/81234567890?pwd=abc")).toBe(true);
    expect(isMeetingLink("https://teams.microsoft.com/l/meetup-join/19%3ameeting_abc%40thread.v2/0")).toBe(true);
    expect(isMeetingLink("http://meet.google.com/abc-defg-hij")).toBe(false);
    expect(isMeetingLink("https://meet.google.com.evil.example/abc-defg-hij")).toBe(false);
    expect(isMeetingLink("https://example.com/meeting")).toBe(false);
  });

  it("finds the meeting link in a message, ignoring other links and punctuation", () => {
    expect(findMeetingLink("Ama, join this: https://meet.google.com/abc-defg-hij. Thanks!")).toBe("https://meet.google.com/abc-defg-hij");
    expect(findMeetingLink("Slides at https://example.com/deck, call at <https://us02web.zoom.us/j/812345?pwd=x>")).toBe("https://us02web.zoom.us/j/812345?pwd=x");
    expect(findMeetingLink("no links here")).toBeNull();
    expect(findMeetingLink("<https://meet.google.com/abc-defg-hij|meet.google.com/abc-defg-hij>")).toBe("https://meet.google.com/abc-defg-hij");
  });
});

describe("the bot page's token", () => {
  it("matches only its own meeting's stored key, and only while the meeting is recent", () => {
    const { token, hash } = newPageToken();
    const now = Date.now();
    expect(hash).not.toContain(token);
    expect(pageTokenMatches(token, hash, new Date(now - 60_000), now)).toBe(true);
    expect(pageTokenMatches(newPageToken().token, hash, new Date(now), now)).toBe(false);
    expect(pageTokenMatches(token, hash, new Date(now - 5 * 60 * 60_000), now)).toBe(false);
    expect(pageTokenMatches(undefined, hash, new Date(now), now)).toBe(false);
    expect(pageTokenMatches(token, undefined, new Date(now), now)).toBe(false);
  });
});

describe("Recall webhooks", () => {
  const secret = `whsec_${randomBytes(24).toString("base64")}`;
  const now = 1_800_000_000_000;
  const body = JSON.stringify({ event: "bot.in_waiting_room", data: { bot: { id: "b1", metadata: { callId: "c1" } } } });
  const sign = (id: string, ts: string, raw: string, key = secret) => `v1,${createHmac("sha256", Buffer.from(key.slice(6), "base64")).update(`${id}.${ts}.${raw}`).digest("base64")}`;
  const headers = (values: Record<string, string>) => (name: string) => values[name];

  it("accepts a fresh, correctly signed event (new and older header names)", () => {
    const ts = String(now / 1000);
    expect(verifyRecallWebhook(body, headers({ "webhook-id": "msg_1", "webhook-timestamp": ts, "webhook-signature": sign("msg_1", ts, body) }), secret, now)).toBe(true);
    expect(verifyRecallWebhook(body, headers({ "svix-id": "msg_1", "svix-timestamp": ts, "svix-signature": `v1,bogus ${sign("msg_1", ts, body)}` }), secret, now)).toBe(true);
  });

  it("refuses a changed body, a wrong secret, a stale event, or no secret configured", () => {
    const ts = String(now / 1000);
    const good = { "webhook-id": "msg_1", "webhook-timestamp": ts, "webhook-signature": sign("msg_1", ts, body) };
    expect(verifyRecallWebhook(`${body} `, headers(good), secret, now)).toBe(false);
    expect(verifyRecallWebhook(body, headers({ ...good, "webhook-signature": sign("msg_1", ts, body, `whsec_${randomBytes(24).toString("base64")}`) }), secret, now)).toBe(false);
    const old = String(now / 1000 - 301);
    expect(verifyRecallWebhook(body, headers({ "webhook-id": "msg_1", "webhook-timestamp": old, "webhook-signature": sign("msg_1", old, body) }), secret, now)).toBe(false);
    expect(verifyRecallWebhook(body, headers(good), "", now)).toBe(false);
  });
});

describe("what we ask Recall for", () => {
  it("names the bot after the mate, uses our page as its camera, and says hello", () => {
    const request = botRequest({ meetingUrl: "https://meet.google.com/abc-defg-hij", mateName: "Ama", ownerName: "Kenneth", pageUrl: "https://agents.askorin.app/meet-bot?m=c1&t=x", callId: "c1" });
    expect(request.bot_name).toBe("Ama (Kenneth’s mate)");
    expect(botRequest({ meetingUrl: "https://meet.google.com/abc-defg-hij", mateName: "Ama", pageUrl: "https://x", callId: "c1" }).bot_name).toBe("Ama (Mates)");
    expect(request.metadata).toEqual({ callId: "c1" });
    expect(request.output_media.camera).toEqual({ kind: "webpage", config: { url: "https://agents.askorin.app/meet-bot?m=c1&t=x" } });
    expect(request.variant.google_meet).toBe("web_4_core");
    expect(request.chat.on_bot_join.message).toContain("Kenneth’s AI mate");
    expect(request.chat.on_bot_join.message).toContain("say my name");
  });
});
