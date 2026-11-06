import { describe, expect, it } from "vitest";
import { cleanPath, deviceOf, fillDays, isBot, referrerHost, visitorId } from "./site-visits.js";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 15_8 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6 Mobile/15E148 Safari/604.1";
const IPAD = "Mozilla/5.0 (iPad; CPU OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1";
const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

describe("site visits", () => {
  it("tells phones, tablets and computers apart", () => {
    expect(deviceOf(IPHONE)).toBe("mobile");
    expect(deviceOf(IPAD)).toBe("tablet");
    expect(deviceOf(MAC)).toBe("desktop");
    expect(deviceOf("Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile Safari/537.36")).toBe("mobile");
    expect(deviceOf("Mozilla/5.0 (Linux; Android 13; SM-X700) Safari/537.36")).toBe("tablet");
  });

  it("skips crawlers and link-preview fetchers", () => {
    expect(isBot("WhatsApp/2.23.20.0")).toBe(true);
    expect(isBot("facebookexternalhit/1.1")).toBe(true);
    expect(isBot("Mozilla/5.0 (compatible; Googlebot/2.1)")).toBe(true);
    expect(isBot("")).toBe(true);
    expect(isBot(IPHONE)).toBe(false);
  });

  it("keeps only the referring host, and treats the site itself as direct", () => {
    expect(referrerHost("https://www.twitter.com/x/status/1?ref=a", "agents.askorin.app")).toBe("twitter.com");
    expect(referrerHost("https://agents.askorin.app/#pricing", "agents.askorin.app")).toBeNull();
    expect(referrerHost("", "agents.askorin.app")).toBeNull();
    expect(referrerHost("not a url", "agents.askorin.app")).toBeNull();
  });

  it("counts a visitor once a day without storing who they are", () => {
    const today = visitorId("1.2.3.4", IPHONE, "2026-11-06", "salt");
    expect(today).toHaveLength(24);
    expect(today).toBe(visitorId("1.2.3.4", IPHONE, "2026-11-06", "salt"));
    expect(today).not.toBe(visitorId("1.2.3.4", IPHONE, "2026-11-07", "salt"));
    expect(today).not.toContain("1.2.3.4");
  });

  it("accepts clean paths only", () => {
    expect(cleanPath("/")).toBe("/");
    expect(cleanPath("/pricing?utm=x#top")).toBe("/pricing");
    expect(cleanPath("https://evil.example/")).toBeNull();
    expect(cleanPath("/<script>")).toBeNull();
    expect(cleanPath(42)).toBeNull();
  });

  it("fills every day in the range, oldest first", () => {
    const days = fillDays([{ day: "2026-11-05", views: 4, visitors: 2 }], 3, new Date("2026-11-06T12:00:00Z"));
    expect(days).toEqual([
      { day: "2026-11-04", views: 0, visitors: 0 },
      { day: "2026-11-05", views: 4, visitors: 2 },
      { day: "2026-11-06", views: 0, visitors: 0 },
    ]);
  });
});
