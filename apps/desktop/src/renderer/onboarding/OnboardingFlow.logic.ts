/**
 * The screens of getting in, and how they connect. Two paths share the first screen: people who
 * already use Mates sign in (Apple, Google or email), and newcomers create an account, then set up
 * their lead mate, tell it about themselves and bring their memories.
 */

export type Screen =
  | "choose"
  | "signIn"
  | "signInPassword"
  | "signInCode"
  /** A new device or a second factor: the code Clerk emails before the sign-in completes. */
  | "signInDevice"
  /** Forgot password: the reset code, then the new password. */
  | "signInReset"
  | "signInNewPassword"
  | "signInSocial"
  | "signUp"
  | "signUpPassword"
  | "signUpCode"
  | "signUpSocial"
  | "leader"
  | "about"
  | "import";

export type FlowState = {
  screen: Screen;
  /** Which way the last move went, so the next screen slides in from the right side. */
  direction: "forward" | "back";
  email: string;
  /** Apple or Google, while you finish in the browser. */
  provider?: SocialProvider;
  /** A line for the screen just reached, like "We emailed you a code"; going back drops it. */
  notice?: string;
};

export type SocialProvider = "apple" | "google";

export const PROVIDER_NAME: Record<SocialProvider, string> = { apple: "Apple", google: "Google" };

export type FlowAction = { type: "go"; to: Screen; email?: string; provider?: SocialProvider; notice?: string } | { type: "back" };

export const INITIAL_FLOW: FlowState = { screen: "choose", direction: "forward", email: "" };

/**
 * Each step steps back to the one before it, so no screen needs a row of "back" links. Once the
 * account exists there's no going back: the setup steps only move forward or skip.
 */
export const BACK: Partial<Record<Screen, Screen>> = {
  signIn: "choose",
  signInPassword: "signIn",
  signInCode: "signInPassword",
  signInDevice: "signInPassword",
  signInReset: "signInPassword",
  signInNewPassword: "signInPassword",
  signInSocial: "signIn",
  signUp: "choose",
  signUpPassword: "signUp",
  signUpCode: "signUpPassword",
  signUpSocial: "signUp",
};

/** The newcomer's journey, for the step indicator. */
export const NEW_STEPS: { label: string; screens: Screen[] }[] = [
  { label: "Account", screens: ["signUp", "signUpPassword", "signUpCode", "signUpSocial"] },
  { label: "Lead mate", screens: ["leader"] },
  { label: "About you", screens: ["about"] },
  { label: "Memories", screens: ["import"] },
];

export function flowReducer(state: FlowState, action: FlowAction): FlowState {
  if (action.type === "back") {
    const previous = BACK[state.screen];
    return previous ? { ...state, screen: previous, direction: "back", notice: undefined } : state;
  }
  return { screen: action.to, direction: "forward", email: action.email ?? state.email, provider: action.provider ?? state.provider, notice: action.notice };
}

/** Where the newcomer is in their journey, or null on the shared and sign-in screens. */
export function newcomerStep(screen: Screen): { index: number; total: number } | null {
  const index = NEW_STEPS.findIndex((step) => step.screens.includes(screen));
  return index < 0 ? null : { index, total: NEW_STEPS.length };
}

export const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());

export const MIN_PASSWORD = 8;
