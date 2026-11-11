import { Platform } from "react-native";
import type { CallLiveActivityProps } from "./call-live-activity";
import { createCallActivityController } from "./call-activity-controller";
import { prepareCallActivityArtwork } from "./call-activity-artwork";

type CallActivityFactory = import("expo-widgets").LiveActivityFactory<CallLiveActivityProps>;

let factory: CallActivityFactory | null = null;

function getFactory() {
  if (Platform.OS !== "ios") return null;
  if (factory) return factory;
  try {
    factory = (require("./call-live-activity") as { default: CallActivityFactory }).default;
    return factory;
  } catch (error) {
    // Expo Go, an older dev build, or disabled native support must not break calls.
    console.warn(
      "[call-live-activity] Factory unavailable:",
      error instanceof Error ? error.message : String(error),
    );
    return null;
  }
}

const controller = createCallActivityController<CallLiveActivityProps>(
  getFactory,
  prepareCallActivityArtwork,
  (operation, error) => console.warn(
    `[call-live-activity] ${operation} failed:`,
    error instanceof Error ? error.message : String(error),
  ),
);

export const startCallActivity = controller.start;
export const updateCallActivity = controller.update;
export const endCallActivity = controller.end;
export const clearOrphanedCallActivities = controller.clearOrphans;
export const getCurrentCallActivityCallId = controller.getCallId;
