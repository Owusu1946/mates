/**
 * Runs one watch's web check now, instead of waiting for its next turn (for testing).
 *   pnpm exec tsx scripts/watch-check.ts <watch id>
 */
import "../src/load-env.js";
import { eq } from "drizzle-orm";
import { getDb } from "../src/db/client.js";
import { watches } from "../src/db/schema.js";
import { checkWatch } from "../src/watches.js";

const id = process.argv[2];
if (!id) {
  console.error("Usage: tsx scripts/watch-check.ts <watch id>");
  process.exit(1);
}
await checkWatch(id);
const [watch] = await getDb().select().from(watches).where(eq(watches.id, id));
console.log(watch ? `${watch.title}: ${watch.status} · ${watch.lastNote ?? "no note"} · ${watch.checks} checks` : "No such watch.");
