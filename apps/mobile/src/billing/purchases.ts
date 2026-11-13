import Purchases, { LOG_LEVEL, type PurchasesPackage } from "react-native-purchases";
import { Platform } from "react-native";
import { env } from "../env";
import { runRequest, usageChanged } from "../chat/background-chat";

type GetToken = () => Promise<string | null>;

/** The store accepted the transaction, but the server hasn't confirmed the plan yet. */
export class PurchaseSyncError extends Error {
  constructor(options: { cause: unknown }) {
    super("Your purchase completed, but your plan is still updating. Please try restoring purchases.", options);
    this.name = "PurchaseSyncError";
  }
}

let configured = false;
let currentUserId: string | null = null;
let desiredUserId: string | null = null;
let pending: Promise<unknown> = Promise.resolve();

// Serialize SDK calls so a sign-out or account switch cannot overtake a purchase.
function enqueue<T>(operation: () => Promise<T>): Promise<T> {
  const result = pending.then(operation);
  pending = result.catch(() => {});
  return result;
}

function apiKey(): string | undefined {
  if (__DEV__ && env.EXPO_PUBLIC_REVENUECAT_TEST_KEY) return env.EXPO_PUBLIC_REVENUECAT_TEST_KEY;
  return Platform.OS === "ios" ? env.EXPO_PUBLIC_REVENUECAT_IOS_KEY : Platform.OS === "android" ? env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY : undefined;
}

export async function identifyPurchases(userId: string | null): Promise<void> {
  desiredUserId = userId;
  await enqueue(async () => {
    if (userId !== desiredUserId) return;
    if (!userId) {
      if (configured && currentUserId) await Purchases.logOut();
      currentUserId = null;
      return;
    }
    const key = apiKey();
    if (!key) return;
    if (!configured) {
      if (__DEV__) await Purchases.setLogLevel(LOG_LEVEL.DEBUG);
      Purchases.configure({ apiKey: key, appUserID: userId });
      configured = true;
    } else if (currentUserId !== userId) {
      await Purchases.logIn(userId);
    }
    currentUserId = userId;
  });
}

function requireIdentity(userId: string): void {
  if (!configured || currentUserId !== userId || desiredUserId !== userId) {
    throw new Error("Purchases are unavailable. Please try again.");
  }
}

export function getOfferings(userId: string) {
  return enqueue(async () => {
    requireIdentity(userId);
    return Purchases.getOfferings();
  });
}

async function syncUsage(userId: string, getToken: GetToken): Promise<void> {
  requireIdentity(userId);
  await runRequest(getToken, "billing/sync", {});
  usageChanged();
}

export function purchasePackage(userId: string, getToken: GetToken, item: PurchasesPackage) {
  return enqueue(async () => {
    requireIdentity(userId);
    const result = await Purchases.purchasePackage(item);
    try {
      await syncUsage(userId, getToken);
    } catch (cause) {
      throw new PurchaseSyncError({ cause });
    }
    return result;
  });
}

export function restorePurchases(userId: string, getToken: GetToken) {
  return enqueue(async () => {
    requireIdentity(userId);
    const result = await Purchases.restorePurchases();
    await syncUsage(userId, getToken);
    return result;
  });
}
