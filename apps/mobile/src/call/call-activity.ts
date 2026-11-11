import { Platform } from "react-native";
import type { CallLiveActivityProps } from "./call-live-activity";

type CallActivityFactory = import("expo-widgets").LiveActivityFactory<CallLiveActivityProps>;
type CallActivityInstance = import("expo-widgets").LiveActivity<CallLiveActivityProps>;

let factory: CallActivityFactory | null = null;
let activeActivity: CallActivityInstance | null = null;
let generation = 0;
let operations = Promise.resolve();

function getFactory() {
  if (Platform.OS !== "ios") return null;
  if (factory) return factory;
  try {
    factory = (require("./call-live-activity") as { default: CallActivityFactory }).default;
    return factory;
  } catch {
    // Expo Go, an older dev build, or disabled native support must not break calls.
    return null;
  }
}

function serialize<T>(operation: () => Promise<T>): Promise<T> {
  const result = operations.then(operation, operation);
  operations = result.then(() => undefined, () => undefined);
  return result;
}

async function endInstances(activityFactory: CallActivityFactory) {
  const instances = new Map<string, CallActivityInstance>();
  try {
    for (const instance of activityFactory.getInstances()) instances.set(instance.getId(), instance);
  } catch {
    // The in-memory instance is still ended below if native enumeration is unavailable.
  }
  if (activeActivity) instances.set(activeActivity.getId(), activeActivity);
  activeActivity = null;
  await Promise.all([...instances.values()].map((instance) => instance.end("immediate").catch(() => {})));
}

export function startCallActivity(props: CallLiveActivityProps) {
  const activityFactory = getFactory();
  if (!activityFactory) return Promise.resolve();
  const attempt = ++generation;
  return serialize(async () => {
    if (attempt !== generation) return;
    await endInstances(activityFactory);
    if (attempt !== generation) return;
    try {
      activeActivity = activityFactory.start(props, "mates:///call");
    } catch {
      // ActivityKit can reject starts when Live Activities are disabled or unavailable.
      activeActivity = null;
    }
  });
}

export function updateCallActivity(props: CallLiveActivityProps) {
  const activityFactory = getFactory();
  if (!activityFactory) return Promise.resolve();
  const attempt = generation;
  return serialize(async () => {
    if (attempt !== generation || !activeActivity) return;
    await activeActivity.update(props).catch(() => {});
  });
}

export function endCallActivity() {
  generation += 1;
  const activityFactory = getFactory();
  if (!activityFactory) {
    activeActivity = null;
    return Promise.resolve();
  }
  return serialize(() => endInstances(activityFactory));
}
