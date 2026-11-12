// One-off check that a mate can join a Google Meet with its own name and its animated mascot as
// its camera (Recall Output Media). Not part of the app: it watches the bot by polling, which
// Recall asks production code not to do (that will use webhooks).
//
//   node --env-file=.env --experimental-strip-types scripts/meet-bot-spike.ts join <meet-url> <page-base-url> [name] [color] [shape]
//   node --env-file=.env --experimental-strip-types scripts/meet-bot-spike.ts leave <bot-id>
//
// <page-base-url> is where /meet-bot is publicly reachable, e.g. an ngrok https URL for `astro preview`.
const key = process.env.RECALL_API_KEY;
const region = process.env.RECALL_REGION ?? "us-west-2";
if (!key) throw new Error("RECALL_API_KEY is missing from apps/api/.env");
const api = (path: string, init: RequestInit = {}) =>
  fetch(`https://${region}.recall.ai/api/v1${path}`, { ...init, headers: { authorization: `Token ${key}`, "content-type": "application/json", ...init.headers } }).then(async (response) => {
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`Recall answered ${response.status}: ${JSON.stringify(body)}`);
    return body as Record<string, any>;
  });

const [command, ...args] = process.argv.slice(2);

if (command === "leave") {
  await api(`/bot/${args[0]}/leave_call/`, { method: "POST" });
  console.log("Asked the bot to leave.");
} else if (command === "join") {
  const [meetingUrl, pageBase, name = "Ama", color = "blue", shape = "cloud"] = args;
  if (!meetingUrl?.startsWith("https://meet.google.com/") || !pageBase?.startsWith("https://")) throw new Error("Usage: join <https://meet.google.com/...> <https://page-base> [name] [color] [shape]");
  const page = `${pageBase.replace(/\/$/, "")}/meet-bot?${new URLSearchParams({ name, color, shape })}`;
  const bot = await api("/bot/", {
    method: "POST",
    body: JSON.stringify({
      meeting_url: meetingUrl,
      bot_name: `${name} (Mates)`,
      output_media: { camera: { kind: "webpage", config: { url: page } } },
      variant: { google_meet: "web_4_core" },
      automatic_leave: { waiting_room_timeout: 600, noone_joined_timeout: 300 },
    }),
  });
  console.log(`Bot ${bot.id} is on its way as "${name} (Mates)".\nCamera page: ${page}\nAdmit it in Meet. Ctrl+C stops watching (the bot stays); "leave ${bot.id}" sends it away.`);
  let last = "";
  for (let i = 0; i < 200; i++) {
    const current = await api(`/bot/${bot.id}/`);
    const status = current.status_changes?.at(-1)?.code ?? "unknown";
    if (status !== last) console.log(new Date().toLocaleTimeString(), status);
    last = status;
    if (["done", "fatal", "call_ended"].includes(status)) break;
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
} else {
  console.log("Commands: join <meet-url> <page-base-url> [name] [color] [shape] | leave <bot-id>");
}
