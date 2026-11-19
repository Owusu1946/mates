/**
 * The mates' desktop, as the agent sees it. Daytona is one implementation (./daytona.ts); the agent
 * and its tests only know this shape, so a Windows desktop or the user's own laptop can be another.
 */

export type Bounds = { x: number; y: number; width: number; height: number };

/** One on-screen control from the accessibility tree, flattened and numbered for the model. */
export type ScreenElement = { id: string; role: string; name: string; bounds: Bounds; focused: boolean };

export type Screenshot = { jpegBase64: string; width: number; height: number };

export type MouseButton = "left" | "right" | "middle";

export interface Desktop {
  readonly id: string;
  screenshot(): Promise<Screenshot>;
  /** Visible, interactive controls (buttons, fields, links…), at most `limit` of them. */
  elements(limit?: number): Promise<ScreenElement[]>;
  move(x: number, y: number): Promise<void>;
  click(x: number, y: number, options?: { button?: MouseButton; double?: boolean }): Promise<void>;
  drag(fromX: number, fromY: number, toX: number, toY: number): Promise<void>;
  scroll(x: number, y: number, direction: "up" | "down" | "left" | "right", amount?: number): Promise<void>;
  /** `delayMs` between characters: 0 at full speed, more while someone is watching. */
  type(text: string, delayMs?: number): Promise<void>;
  press(key: string, modifiers?: string[]): Promise<void>;
  hotkey(keys: string): Promise<void>;
  /** A shell command inside the desktop, never on our servers. Output is trimmed. */
  exec(command: string, timeoutSeconds?: number): Promise<{ code: number; output: string }>;
  /** The strip across the top of the screen that says what the mate is doing; null hides it. */
  caption(text: string | null): Promise<void>;
  startRecording(label: string): Promise<string | null>;
  /** Stops a recording and returns where its file sits inside the desktop. */
  stopRecording(id: string): Promise<string | null>;
}

/** Roles a person can act on; everything else in the tree is layout. */
export const INTERACTIVE_ROLES = new Set([
  "push button", "toggle button", "check box", "radio button", "combo box", "entry", "text",
  "password text", "spin button", "slider", "link", "menu item", "check menu item", "radio menu item",
  "page tab", "list item", "table cell", "tree item", "icon", "menu",
]);

/** Fields where a mate must never type: the user enters these privately. */
export const isSecretField = (element: Pick<ScreenElement, "role" | "name">) =>
  element.role === "password text" || /\b(password|passcode|one.?time|otp|verification code|security code|cvv|cvc|pin)\b/i.test(element.name);
