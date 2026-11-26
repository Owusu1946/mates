/**
 * What every Mates client needs to talk to the API the same way: reading run streams and merging
 * history pages. Pure TypeScript, so the desktop and (later) the phone share one tested copy
 * (docs/desktop/desktop-app.md, packages/client-core).
 */
export { readRunStreamEvents, type RunStreamEvent } from "./runStream.ts";
export { canonical, planMerge, rootPage, sameMessage, type HistoryItem, type HistoryMessage, type HistoryRepository, type MergeOptions } from "./historyMerge.ts";
