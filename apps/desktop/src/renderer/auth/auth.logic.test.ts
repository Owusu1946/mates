import assert from "node:assert/strict";
import { test } from "node:test";
import { FALLBACK, errorFor, plainError, readClerkError } from "./clerkErrors.logic.ts";
import { signInNext } from "./signInNext.logic.ts";

test("Clerk's errors land under their field, in the phone's words", () => {
  const read = readClerkError({ errors: [{ code: "form_password_incorrect", message: "dev text", meta: { paramName: "password" } }] });
  assert.deepEqual(read.fields, { password: "That password isn’t right." });
  assert.deepEqual(read.codes, ["form_password_incorrect"]);
  assert.equal(read.message, "");
});

test("an error without a field becomes the screen's message, preferring the user-facing text", () => {
  const read = readClerkError({ errors: [{ code: "something_new", message: "dev text", longMessage: "Please wait a moment." }] });
  assert.equal(read.message, "Please wait a moment.");
  assert.deepEqual(read.fields, {});
});

test("an unknown throw reads as the fallback, and a known code still gets friendly words", () => {
  assert.equal(readClerkError(new Error("network")).message, FALLBACK);
  assert.equal(readClerkError(null).message, FALLBACK);
  assert.equal(readClerkError({ code: "too_many_requests" }).message, "Too many attempts. Wait a moment, then try again.");
});

test("a field shows its own error, or the screen's message when no field claimed one", () => {
  const fielded = readClerkError({ errors: [{ code: "form_code_incorrect", meta: { paramName: "code" } }] });
  assert.equal(errorFor(fielded, "code"), "That code isn’t right. Check it and try again.");
  assert.equal(errorFor(fielded, "password"), null);
  assert.equal(errorFor(plainError("Try again."), "password"), "Try again.");
  assert.equal(errorFor(null, "email"), null);
});

test("after the first factor: finish, a code by email, or a new password", () => {
  const email = [{ strategy: "email_code" }];
  assert.equal(signInNext("complete", []), "complete");
  assert.equal(signInNext("needs_client_trust", email), "deviceCode");
  assert.equal(signInNext("needs_second_factor", [{ strategy: "totp" }, ...email]), "deviceCode");
  assert.equal(signInNext("needs_second_factor", [{ strategy: "totp" }]), "unsupported");
  assert.equal(signInNext("needs_client_trust", null), "unsupported");
  assert.equal(signInNext("needs_new_password", []), "newPassword");
  assert.equal(signInNext("needs_first_factor", []), "unknown");
});
