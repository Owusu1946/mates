import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

/**
 * Tactile feedback engine providing consistent, safe haptics across mobile platforms.
 * Safe for web and devices without haptic motors (no unhandled rejections).
 */
export const haptic = {
  /** Crisp, subtle tick for tab changes, segment switches, and picker scrolls */
  selection: () => {
    if (Platform.OS === "web") return;
    Haptics.selectionAsync().catch(() => {});
  },
  /** Light tap for button presses, icon toggles, and counter increments */
  light: () => {
    if (Platform.OS === "web") return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  },
  /** Medium tap for modal dismissals, pull-to-refresh snaps, and state resets */
  medium: () => {
    if (Platform.OS === "web") return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  },
  /** Heavy punch for destructive actions, long-press triggers, and prominent confirmations */
  heavy: () => {
    if (Platform.OS === "web") return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
  },
  /** Notification feedback for completed tasks, successful saves, and checkouts */
  success: () => {
    if (Platform.OS === "web") return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  },
  /** Notification feedback for warnings, validation alerts, and limits reached */
  warning: () => {
    if (Platform.OS === "web") return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
  },
  /** Notification feedback for errors, failed operations, and rejected actions */
  error: () => {
    if (Platform.OS === "web") return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
  },
};
