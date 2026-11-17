/** User closed the store sheet; not a failed purchase. */
export function purchaseUserCancelled(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  if ("userCancelled" in error && (error as { userCancelled?: boolean }).userCancelled === true) return true;
  const code = (error as { code?: string }).code;
  if (code === "PURCHASE_CANCELLED_ERROR" || code === "PurchaseCancelledError") return true;
  const message = error instanceof Error ? error.message : String((error as { message?: unknown }).message ?? "");
  return /purchase was cancel/i.test(message);
}