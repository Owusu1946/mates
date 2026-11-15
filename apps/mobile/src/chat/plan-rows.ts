import type { WorkflowCard } from "@expojet/api-contract";

/**
 * How a mate's actions read as compact rows: the item's own name first ("Frontend study plan", not
 * "Create notion page" with a "Title:" line), one quiet detail line, and repeated actions folded
 * into one row ("Created 3 events · Mon 16, Wed 18, Fri 20 Nov · 19:00–20:00").
 */
export type Action = NonNullable<WorkflowCard["plan"]>["actions"][number];
export type Row = { key: string; actions: Action[]; primary: string; secondary: string | null };

/** Details worth a line under the name, in order of usefulness. Long bodies stay out of the row. */
const SECONDARY = ["When", "To", "Channel", "Guests", "Subject", "Video"];

/** "(Africa/Accra)" adds nothing when it's the timezone the person is in. */
export function withoutOwnZone(value: string, zone: string | undefined) {
  return zone ? value.replace(` (${zone})`, "") : value;
}

const detail = (action: Action, label: string) => action.details.find((d) => d.label === label)?.value;

function rowFor(action: Action, zone: string | undefined): Row {
  const title = detail(action, "Title");
  const extra = SECONDARY.map((label) => detail(action, label)).find(Boolean);
  return {
    key: action.id,
    actions: [action],
    primary: title ?? action.title,
    secondary: extra ? withoutOwnZone(extra, zone) : title ? action.title : null,
  };
}

/** "Mon 16 Nov, 19:00–20:00" → { day: "Mon 16 Nov", time: "19:00–20:00" }. */
function splitWhen(value: string) {
  const comma = value.indexOf(", ");
  return comma < 0 ? { day: value, time: "" } : { day: value.slice(0, comma), time: value.slice(comma + 2) };
}

/** Three events on different days at the same time read as one line of days and one time. */
function whenSummary(values: string[]) {
  const parts = values.map(splitWhen);
  const months = new Set(parts.map((p) => p.day.split(" ").at(-1)));
  const days = months.size === 1 ? `${parts.map((p) => p.day.split(" ").slice(0, -1).join(" ")).join(", ")} ${[...months][0]}` : parts.map((p) => p.day).join(", ");
  const times = new Set(parts.map((p) => p.time));
  return times.size === 1 && parts[0]!.time ? `${days} · ${parts[0]!.time}` : days;
}

/** "Created an event" ×3 → "Created 3 events"; anything else → "<title> ×3". */
function groupTitle(title: string, count: number) {
  const event = /^(Created|Updated) (?:an event|“[^”]*”)$/.exec(title);
  return event ? `${event[1]} ${count} events` : `${title} ×${count}`;
}

/** Same app, same kind of action, same outcome, and all finished: one row, which unfolds. */
const sameGroup = (a: Action, b: Action) =>
  a.kind === b.kind && a.app === b.app && a.status === "done" && b.status === "done" && a.title.replace(/“[^”]*”/, "“”") === b.title.replace(/“[^”]*”/, "“”");

/**
 * The rows to show. While reviewing, every action is its own row (each has its own checkbox);
 * afterwards, runs of the same finished action become one row.
 */
export function planRows(actions: Action[], { group, zone }: { group: boolean; zone?: string }): Row[] {
  const rows: Row[] = [];
  for (const action of actions) {
    const last = rows.at(-1);
    if (group && last && sameGroup(last.actions[0]!, action)) last.actions.push(action);
    else rows.push(rowFor(action, zone));
  }
  return rows.map((row) => {
    if (row.actions.length === 1) return row;
    const whens = row.actions.map((a) => detail(a, "When")).filter((v): v is string => !!v).map((v) => withoutOwnZone(v, zone));
    return { ...row, primary: groupTitle(row.actions[0]!.title, row.actions.length), secondary: whens.length === row.actions.length ? whenSummary(whens) : row.secondary };
  });
}

/** The summary line for a finished set of actions. */
export function doneHeadline(actions: Action[]) {
  const done = actions.filter((a) => a.status === "done").length;
  const things = (n: number) => `${n} ${n === 1 ? "thing" : "things"}`;
  return done === actions.length ? `Did ${things(done)}` : `Did ${done} of ${things(actions.length)}`;
}
