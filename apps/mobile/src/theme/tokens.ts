export interface ColorTokens {
  background: string;
  surface: string;
  surfaceElevated: string;
  border: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  primary: string;
  primaryForeground: string;
  card: string;
  error: string;
}

export const lightColors: ColorTokens = {
  background: "#ffffff",
  surface: "#f8fafc",
  surfaceElevated: "#f1f5f9",
  border: "#e2e8f0",
  text: "#0f172a",
  textSecondary: "#475569",
  textMuted: "#94a3b8",
  primary: "#4f46e5",
  primaryForeground: "#ffffff",
  card: "#ffffff",
  error: "#ef4444",
};

export const darkColors: ColorTokens = {
  background: "#09090b",
  surface: "#18181b",
  surfaceElevated: "#27272a",
  border: "#27272a",
  text: "#fafafa",
  textSecondary: "#a1a1aa",
  textMuted: "#71717a",
  primary: "#6366f1",
  primaryForeground: "#ffffff",
  card: "#18181b",
  error: "#f87171",
};
