import "../src/load-env.js";
import { z } from "zod";
import { listRecentNegativeFeedback } from "../src/message-feedback.js";

const parsedDays = z.coerce.number().int().min(1).max(90).safeParse(process.argv[2] ?? "7");
if (!parsedDays.success) throw new Error("Usage: pnpm exec tsx scripts/message-feedback-report.ts [days: 1-90]");

const rows = await listRecentNegativeFeedback(parsedDays.data);
console.log(JSON.stringify({ days: parsedDays.data, count: rows.length, feedback: rows }, null, 2));
