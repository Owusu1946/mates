import { afterEach, describe, expect, it, vi } from "vitest";
import { keytermsFor, listenUrl, transcribe, transcriptOf } from "./transcription.js";

describe("transcription", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("boosts the user's names first, then the base list, deduped and capped", () => {
    const terms = keytermsFor(["Nova", "Ivy", "cooper", "Ama, Mensah", ""]);
    expect(terms.slice(0, 4)).toEqual(["Nova", "Ivy", "cooper", "Ama Mensah"]);
    expect(terms.filter((t) => t.toLowerCase() === "cooper")).toHaveLength(1);
    expect(terms).toContain("Accra");
    expect(keytermsFor(Array.from({ length: 80 }, (_, i) => `Mate${i}`))).toHaveLength(40);
  });

  it("asks Nova-3 for punctuated English with one keyterm per term", () => {
    const url = new URL(listenUrl(["Nova", "East Legon"]));
    expect(url.origin + url.pathname).toBe("https://api.deepgram.com/v1/listen");
    expect(Object.fromEntries([...url.searchParams].filter(([k]) => k !== "keyterm"))).toEqual({ model: "nova-3", language: "en", smart_format: "true", punctuate: "true" });
    expect(url.searchParams.getAll("keyterm")).toEqual(["Nova", "East Legon"]);
  });

  it("reads the transcript, and treats no speech or odd shapes as empty", () => {
    expect(transcriptOf({ results: { channels: [{ alternatives: [{ transcript: " Hello Nova. " }] }] } })).toBe("Hello Nova.");
    expect(transcriptOf({ results: { channels: [{ alternatives: [{ transcript: "" }] }] } })).toBe("");
    expect(transcriptOf({})).toBe("");
    expect(transcriptOf(null)).toBe("");
  });

  it("retries a server error once, and does not retry a bad request", async () => {
    const ok = new Response(JSON.stringify({ results: { channels: [{ alternatives: [{ transcript: "Book a table in Osu." }] }] } }), { status: 200 });
    const flaky = vi.fn().mockResolvedValueOnce(new Response("down", { status: 503 })).mockResolvedValueOnce(ok);
    vi.stubGlobal("fetch", flaky);
    await expect(transcribe(new ArrayBuffer(10), { contentType: "audio/m4a", keyterms: [] })).resolves.toBe("Book a table in Osu.");
    expect(flaky).toHaveBeenCalledTimes(2);

    const bad = vi.fn(async () => new Response("bad", { status: 400 }));
    vi.stubGlobal("fetch", bad);
    await expect(transcribe(new ArrayBuffer(10), { contentType: "audio/m4a", keyterms: [] })).rejects.toThrow("400");
    expect(bad).toHaveBeenCalledTimes(1);
  });

  it("returns nothing for an empty clip without calling Deepgram", async () => {
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    await expect(transcribe(new ArrayBuffer(0), { contentType: "audio/m4a", keyterms: [] })).resolves.toBe("");
    expect(spy).not.toHaveBeenCalled();
  });
});
