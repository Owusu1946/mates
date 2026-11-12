import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** Everything the Slack app needs on this server. Optional integration: read from process.env like the others. */
export const slackConfigured = () =>
  !!(process.env.SLACK_CLIENT_ID && process.env.SLACK_CLIENT_SECRET && process.env.SLACK_SIGNING_SECRET && process.env.SLACK_TOKEN_KEY);

/** Requests older than this are refused, so a captured request can't be replayed later. */
const MAX_AGE_SECONDS = 5 * 60;

/**
 * Whether a request really came from Slack: `v0=` HMAC-SHA256 of `v0:{timestamp}:{raw body}` with the
 * app's signing secret, compared in constant time, and no older than five minutes.
 */
export function verifySlackSignature(rawBody: string, timestamp: string | undefined, signature: string | undefined, secret = process.env.SLACK_SIGNING_SECRET ?? "", now = Date.now()) {
  if (!secret || !timestamp || !signature || !/^\d+$/.test(timestamp)) return false;
  if (Math.abs(now / 1000 - Number(timestamp)) > MAX_AGE_SECONDS) return false;
  const expected = Buffer.from(`v0=${createHmac("sha256", secret).update(`v0:${timestamp}:${rawBody}`).digest("hex")}`);
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

const tokenKey = () => {
  const key = Buffer.from(process.env.SLACK_TOKEN_KEY ?? "", "base64");
  if (key.length !== 32) throw new Error("SLACK_TOKEN_KEY must be 32 bytes, base64 (openssl rand -base64 32).");
  return key;
};

/** Encrypts a workspace's bot token for storage: AES-256-GCM, stored as `iv.tag.ciphertext` (base64url). */
export function encryptToken(token: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", tokenKey(), iv);
  const data = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((part) => part.toString("base64url")).join(".");
}

/** The bot token back, in memory only. Throws if the value was changed or the key is wrong. */
export function decryptToken(stored: string) {
  const [iv, tag, data] = stored.split(".").map((part) => Buffer.from(part, "base64url"));
  if (!iv || !tag || !data) throw new Error("Stored Slack token is malformed.");
  const decipher = createDecipheriv("aes-256-gcm", tokenKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

const stateKey = (purpose: string) =>
  createHmac("sha256", process.env.SLACK_STATE_SECRET ?? process.env.CLERK_SECRET_KEY ?? "").update(`slack-${purpose}-state`).digest();

/**
 * A signed, expiring value for a Slack round trip (as `github.ts` does for installs). `purpose` keeps
 * an install state from being replayed as an account-link token, and the other way round.
 */
export function signState(purpose: "install" | "link", data: Record<string, string>, now = Date.now(), ttlMs = 15 * 60_000) {
  const payload = Buffer.from(JSON.stringify({ ...data, e: now + ttlMs, n: randomBytes(8).toString("hex") })).toString("base64url");
  return `${payload}.${createHmac("sha256", stateKey(purpose)).update(payload).digest("base64url")}`;
}

export function verifyState(purpose: "install" | "link", state: string, now = Date.now()): Record<string, string> | null {
  const [payload, signature] = state.split(".");
  if (!payload || !signature) return null;
  const expected = Buffer.from(createHmac("sha256", stateKey(purpose)).update(payload).digest("base64url"));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const { e, n: _nonce, ...data } = JSON.parse(Buffer.from(payload, "base64url").toString()) as Record<string, string | number>;
    return typeof e === "number" && e > now ? (data as Record<string, string>) : null;
  } catch {
    return null;
  }
}
