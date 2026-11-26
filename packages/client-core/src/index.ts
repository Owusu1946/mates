/**
 * What every Mates client needs to talk to the API the same way: reading run streams and merging
 * history pages. Pure TypeScript, so the desktop and (later) the phone share one tested copy
 * (docs/desktop/desktop-app.md, packages/client-core).
 */
export { readRunStreamEvents, type RunStreamEvent } from "./runStream.ts";
export { branchTo, cleanMessage, headOf, leafUnder, siblingsOf, textOf, type StoredItem, type StoredMessage, type StoredPart, type StoredTextPart, type StoredToolPart } from "./messages.ts";
export { requestKeyFor, RUN_SETTLED, runRequest, turnsFrom, type RunRequest, type RunTurn } from "./runRequest.ts";
export { applyRunEvent, applyRunSnapshot, retryDelay, settledContent, startProgress, type RunProgress } from "./runProgress.ts";
export { canonical, planMerge, rootPage, sameMessage, type HistoryItem, type HistoryMessage, type HistoryRepository, type MergeOptions } from "./historyMerge.ts";
