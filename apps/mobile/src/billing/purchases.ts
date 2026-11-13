import Purchases, { LOG_LEVEL, type PurchasesPackage } from "react-native-purchases";
import { Platform } from "react-native";
import { env } from "../env";
import { ApiError, runRequest, usageChanged } from "../chat/background-chat";
import type { UsageResponse } from "@expojet/api-contract";

type GetToken = () => Promise<string | null>;

/** The store accepted the transaction, but the server hasn't confirmed the plan yet. */
export class PurchaseSyncError extends Error {
  constructor(action: "purchase" | "restore", options: { cause: unknown }) {
    const unavailable = options.cause instanceof ApiError && options.cause.status === 404;
    super(action === "purchase" ? "Your purchase completed, but your plan is still updating. Please try restoring purchases." : unavailable ? "Restore completed, but plan sync is unavailable. Try again later." : "Restore completed, but your plan couldn’t be updated. Please try again.", options);
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

export function getCustomerInfo(userId: string) {
  return enqueue(async () => {
    requireIdentity(userId);
    return Purchases.getCustomerInfo();
  });
}

async function syncUsage(userId: string, getToken: GetToken): Promise<UsageResponse> {
  requireIdentity(userId);
  const usage = await runRequest<UsageResponse>(getToken, "billing/sync", {}, undefined, { quietNotFound: true });
  usageChanged();
  return usage;
}

export function purchasePackage(userId: string, getToken: GetToken, item: PurchasesPackage) {
  return enqueue(async () => {
    requireIdentity(userId);
    const result = await Purchases.purchasePackage(item);
    try {
      await syncUsage(userId, getToken);
    } catch (cause) {
      throw new PurchaseSyncError("purchase", { cause });
    }
    return result;
  });
}

export function restorePurchases(userId: string, getToken: GetToken) {
  return enqueue(async () => {
    requireIdentity(userId);
    const customerInfo = await Purchases.restorePurchases();
    try {
      const usage = await syncUsage(userId, getToken);
      return { customerInfo, usage };
    } catch (cause) {
      throw new PurchaseSyncError("restore", { cause });
    }
  });
}
