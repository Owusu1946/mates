export const ACTIVITY_MODES = [
  { value: "quiet", label: "Zen", description: "Hide routine work steps." },
  { value: "detailed", label: "Full activity", description: "Show work steps inline." },
] as const;

export type ChatActivityMode = (typeof ACTIVITY_MODES)[number]["value"];
