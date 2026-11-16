import assert from "node:assert/strict";
import { test } from "node:test";
import { purchaseUserCancelled } from "./purchase-user-cancelled.ts";

test("detects RevenueCat user-cancelled purchases", () => {
  assert.equal(purchaseUserCancelled({ userCancelled: true }), true);
  assert.equal(purchaseUserCancelled({ code: "PURCHASE_CANCELLED_ERROR" }), true);
  assert.equal(purchaseUserCancelled(new Error("Purchase was cancelled.")), true);
  assert.equal(purchaseUserCancelled(new Error("Network error")), false);
});