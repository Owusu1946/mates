/**
 * Decides how much of a model step's text the user can see while it's still being written.
 *
 * Text beside a tool call is narration ("Let me check your calendar"), and a model sometimes
 * writes a tool call out as text ("to=functions.x {…}"); neither should reach the screen. So the
 * first START_AFTER characters are held: a tool call or a written-out call in that window means
 * nothing is shown, as before. Past it the step is an answer, and it streams a word at a time,
 * never cutting a citation like [s1] in half (each chunk is formatted on its own).
 */
export const START_AFTER = 160;
const LEAK_MARKER = "to=functions.";

export class AnswerStream {
  private full = "";
  /** Characters of `full` already shown. */
  private shown = 0;
  private started = false;
  private stopped = false;

  constructor(
    private readonly show: (chunk: string) => void,
    private readonly format: (chunk: string) => string = (chunk) => chunk,
  ) {}

  /** Whether any of this step's text has reached the user. */
  get streamed() {
    return this.shown > 0;
  }

  /** The text already shown, so a retried step can continue from it rather than repeat it. */
  get shownText() {
    return this.full.slice(0, this.shown);
  }

  /** `toolCall`: the step has produced a tool call; nothing more streams after that. */
  push(delta: string, toolCall: boolean) {
    this.full += delta;
    if (toolCall || this.full.includes(LEAK_MARKER)) this.stopped = true;
    if (this.stopped) return;
    if (!this.started) {
      if (this.full.length < START_AFTER) return;
      this.started = true;
    }
    this.emit(safeEnd(this.full, this.shown));
  }

  /**
   * What is left to show when the step ends. With no tool call that is the rest of the answer
   * (all of it if nothing streamed). With one, only the rest of text that already started
   * streaming, so a sentence isn't left cut off; held narration stays hidden as before.
   */
  finish(toolCall: boolean) {
    if (toolCall && !this.streamed) return;
    const leak = this.full.indexOf(LEAK_MARKER);
    this.emit(leak >= 0 ? leak : this.full.length);
  }

  private emit(end: number) {
    if (end <= this.shown) return;
    const chunk = this.full.slice(this.shown, end);
    this.shown = end;
    if (chunk) this.show(this.format(chunk));
  }
}

/**
 * The furthest point that can be shown now: the last whitespace (a half-written word may yet turn
 * into a marker or a link), and never inside a citation bracket that hasn't closed.
 */
function safeEnd(text: string, from: number) {
  let end = Math.max(text.lastIndexOf(" "), text.lastIndexOf("\n"), text.lastIndexOf("\t")) + 1;
  const open = text.lastIndexOf("[", end - 1);
  if (open >= from && open > text.lastIndexOf("]", end - 1)) end = open;
  return Math.max(end, from);
}
