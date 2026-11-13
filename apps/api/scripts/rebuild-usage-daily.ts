/**
 * Rebuilds the daily totals from the ledger, for days in a range, if they ever drift (say, after
 * fixing a row by hand).
 *   pnpm exec tsx scripts/rebuild-usage-daily.ts <from YYYY-MM-DD> <to YYYY-MM-DD>
 */
import "../src/load-env.js";
import { sql } from "drizzle-orm";
import { getDb } from "../src/db/client.js";

const [from, to] = process.argv.slice(2);
const day = /^\d{4}-\d{2}-\d{2}$/;
if (!from || !to || !day.test(from) || !day.test(to)) {
  console.error("Usage: tsx scripts/rebuild-usage-daily.ts <from YYYY-MM-DD> <to YYYY-MM-DD>");
  process.exit(1);
}

const db = getDb();
await db.batch([
  db.execute(sql`DELETE FROM usage_daily WHERE day BETWEEN ${from} AND ${to}`),
  db.execute(sql`
    INSERT INTO usage_daily (day, clerk_user_id, plan, source, provider, model, cost_micros, input_tokens, cached_tokens, output_tokens, seconds, events)
    SELECT to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day, clerk_user_id, plan, source, provider, model,
      sum(cost_micros), sum(input_tokens), sum(cached_tokens), sum(output_tokens), sum(seconds), count(*)
    FROM usage_events
    WHERE to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') BETWEEN ${from} AND ${to}
    GROUP BY 1, 2, 3, 4, 5, 6`),
]);
console.log(`Rebuilt daily usage for ${from} to ${to}.`);
