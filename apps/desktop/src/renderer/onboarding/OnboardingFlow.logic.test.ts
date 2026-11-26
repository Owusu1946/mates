import assert from "node:assert/strict";
import { test } from "node:test";
import { INITIAL_FLOW, flowReducer, isEmail, newcomerStep } from "./OnboardingFlow.logic.ts";

test("going forward remembers the email and slides forward", () => {
  const state = flowReducer(INITIAL_FLOW, { type: "go", to: "signUpPassword", email: "ama@example.com" });
  assert.deepEqual(state, { screen: "signUpPassword", direction: "forward", email: "ama@example.com", provider: undefined, notice: undefined });
  assert.equal(flowReducer(state, { type: "go", to: "signUpCode" }).email, "ama@example.com");
});

test("back steps to the screen before, and slides back", () => {
  const code = { screen: "signInCode" as const, direction: "forward" as const, email: "ama@example.com" };
  assert.deepEqual(flowReducer(code, { type: "back" }), { ...code, screen: "signInPassword", direction: "back", notice: undefined });
  assert.equal(flowReducer({ ...code, screen: "signUp" }, { type: "back" }).screen, "choose");
});

test("a notice belongs to the screen it was sent with: the next step or going back drops it", () => {
  const device = flowReducer({ ...INITIAL_FLOW, screen: "signInPassword" }, { type: "go", to: "signInDevice", notice: "New device. We emailed you a code." });
  assert.equal(device.notice, "New device. We emailed you a code.");
  assert.equal(flowReducer(device, { type: "back" }).notice, undefined);
  assert.equal(flowReducer(device, { type: "go", to: "signInReset" }).notice, undefined);
});

test("the extra sign-in steps (a new device, a reset) step back to the password", () => {
  for (const screen of ["signInDevice", "signInReset", "signInNewPassword"] as const)
    assert.equal(flowReducer({ ...INITIAL_FLOW, screen }, { type: "back" }).screen, "signInPassword");
});

test("Apple or Google waits on the browser, and back returns to the choice", () => {
  const waiting = flowReducer({ ...INITIAL_FLOW, screen: "signIn" }, { type: "go", to: "signInSocial", provider: "google" });
  assert.equal(waiting.provider, "google");
  assert.equal(flowReducer(waiting, { type: "back" }).screen, "signIn");
  assert.equal(flowReducer({ ...waiting, screen: "signUpSocial" }, { type: "back" }).screen, "signUp");
  assert.deepEqual(newcomerStep("signUpSocial"), { index: 0, total: 4 });
});

test("once the account exists, setup can't go back", () => {
  for (const screen of ["leader", "about", "import", "choose"] as const) {
    const state = { screen, direction: "forward" as const, email: "" };
    assert.equal(flowReducer(state, { type: "back" }), state);
  }
});

test("the step indicator covers only the newcomer's journey", () => {
  assert.deepEqual(newcomerStep("signUpCode"), { index: 0, total: 4 });
  assert.deepEqual(newcomerStep("leader"), { index: 1, total: 4 });
  assert.deepEqual(newcomerStep("import"), { index: 3, total: 4 });
  assert.equal(newcomerStep("signIn"), null);
  assert.equal(newcomerStep("choose"), null);
});

test("emails need a name, an @ and a domain", () => {
  assert.equal(isEmail("ama@example.com"), true);
  assert.equal(isEmail("  ama@example.com.gh "), true);
  assert.equal(isEmail("ama@example"), false);
  assert.equal(isEmail("ama example.com"), false);
  assert.equal(isEmail(""), false);
});
