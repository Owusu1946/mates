import { useTheme } from "./provider";

// Auth-only tokens keep the signed-in product's current theme unchanged.
const light = {
  background: "#F8F7F4",
  text: "#222522",
  secondary: "#676C66",
  muted: "#787D76",
  surface: "#FFFFFF",
  field: "#F0EFEB",
  border: "#DEDFD8",
  accent: "#57694D",
  peach: "#E8C4B4",
  peachLight: "#F3DFD3",
  peachDark: "#BD8873",
  eye: "#343B30",
  button: "#242C23",
  buttonText: "#FFFFFF",
  error: "#A23331",
  errorSurface: "#F9E9E5",
  success: "#46653D",
  glass: "rgba(255,255,255,0.7)",
  rim: "rgba(255,255,255,0.9)",
};
const dark: typeof light = {
  background: "#151714",
  text: "#F3F2EC",
  secondary: "#B5B9AF",
  muted: "#979F93",
  surface: "#242821",
  field: "#22261F",
  border: "#3B4136",
  accent: "#BCCBB0",
  peach: "#DDB49E",
  peachLight: "#EACABB",
  peachDark: "#A57963",
  eye: "#343B30",
  button: "#E8ECDD",
  buttonText: "#252B21",
  error: "#FFB3A6",
  errorSurface: "#36231F",
  success: "#B3CDA4",
  glass: "rgba(39,44,34,0.85)",
  rim: "rgba(255,255,255,0.12)",
};
export const authLayout = {
  maxWidth: 420,
  edge: 28,
  gap: 14,
  smallGap: 6,
  sectionGap: 20,
  buttonHeight: 54,
  controlRadius: 28,
  fieldRadius: 18,
  textSize: 16,
  titleSize: 40,
  compactTitleSize: 32,
  bodySize: 16,
  captionSize: 13,
  markSize: 100,
  smallMarkSize: 50,
};
export function useAuthTheme() {
  const { isDark } = useTheme();
  return { colors: isDark ? dark : light, isDark };
}
