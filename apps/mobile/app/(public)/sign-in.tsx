import { useSignIn } from "@clerk/expo";
import { Redirect, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { View, type TextInput } from "react-native";
import { AuthLayout } from "../../src/components/auth/auth-layout";
import { AuthAction } from "../../src/components/auth/auth-action";
import {
  AuthField,
  AuthLink,
  AuthMessage,
} from "../../src/components/auth/auth-fields";
import { isEmail, readClerkError, usePasswordMinLength, type FieldErrors } from "../../src/components/auth/clerk-errors";
import { SocialAuthButtons } from "../../src/components/auth/social-buttons";
import { useAuthRequest } from "../../src/components/auth/use-auth-request";
import { haptic } from "../../src/haptics";
import { useSession } from "../../src/session/provider";
import { authLayout } from "../../src/theme/auth";

/** "device": a new device (or a second factor) needs the code Clerk emails before the sign-in completes. */
type Mode = "welcome" | "email" | "forgot" | "code" | "new-password" | "device";
const RESEND_AFTER = 30;
const CODE_LENGTH = 6;

export default function SignInScreen() {
  const session = useSession();
  const router = useRouter();
  const { signIn, fetchStatus } = useSignIn();
  const minLength = usePasswordMinLength();
  const [emailAddress, setEmailAddress] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [mode, setMode] = useState<Mode>("welcome");
  const [socialPending, setSocialPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [noAccount, setNoAccount] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const passwordRef = useRef<TextInput>(null);
  const request = useAuthRequest();
  const busy = request.busy || fetchStatus === "fetching" || socialPending;

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  if (session.status === "authenticated") return <Redirect href="/" />;
  const email = emailAddress.trim();

  function changeMode(next: Mode) {
    request.setError(null);
    setNotice(null);
    setFieldErrors({});
    setNoAccount(false);
    setCode("");
    setMode(next);
  }
  const fail = (error: unknown) => {
    const read = readClerkError(error);
    setFieldErrors(read.fields);
    setNoAccount(read.codes.includes("form_identifier_not_found"));
    request.setError(read.message || null);
    haptic.error();
    return read;
  };
  const done = () => signIn.finalize({ navigate: () => router.replace("/") });

  /** After the password: finish, or take the extra step Clerk asks for (a code by email on a new device). */
  async function afterFirstFactor() {
    if (signIn.status === "complete") return done();
    if (signIn.status === "needs_client_trust" || signIn.status === "needs_second_factor") {
      if (signIn.supportedSecondFactors?.some((factor) => factor.strategy === "email_code")) {
        const { error } = await signIn.mfa.sendEmailCode();
        if (error) return void fail(error);
        changeMode("device");
        setCooldown(RESEND_AFTER);
        setNotice(signIn.status === "needs_client_trust" ? "New device. For your security, we emailed you a code." : "We emailed you a code to finish signing in.");
        return;
      }
      request.setError("This account needs a verification method this app doesn’t support yet. Sign in with Apple or Google, or contact support.");
      return;
    }
    if (signIn.status === "needs_new_password") {
      changeMode("forgot");
      setNotice("Your password needs to be changed before you can sign in. We’ll email you a code.");
      return;
    }
    request.setError("This sign-in needs another step. Please try again, or contact support.");
  }

  async function submit() {
    setFieldErrors({});
    setNoAccount(false);
    if (!isEmail(email)) {
      setFieldErrors({ email: "Enter a valid email address." });
      haptic.error();
      return;
    }
    const { error } = await signIn.password({ emailAddress: email, password });
    if (error) {
      const read = fail(error);
      // A breached password can't be used to sign in here: go straight to setting a new one.
      if (read.codes.includes("form_password_pwned")) {
        changeMode("forgot");
        setNotice("Your password appeared in a data breach, so it can’t be used anymore. We’ll email you a code to set a new one.");
      }
      return;
    }
    await afterFirstFactor();
  }

  async function verifyDevice(value = code) {
    setFieldErrors({});
    const { error } = await signIn.mfa.verifyEmailCode({ code: value.trim() });
    if (error) return void fail(error);
    if (signIn.status === "complete") await done();
    else request.setError("That didn’t finish signing you in. Please try again.");
  }

  async function resendDevice() {
    const { error } = await signIn.mfa.sendEmailCode();
    if (error) return void fail(error);
    setCode("");
    setCooldown(RESEND_AFTER);
    setNotice("A new code is on its way. Check your inbox and spam folder.");
  }

  async function sendReset() {
    setFieldErrors({});
    if (!isEmail(email)) {
      setFieldErrors({ email: "Enter a valid email address." });
      haptic.error();
      return;
    }
    const { error: createError } = await signIn.create({ identifier: email });
    if (createError) return void fail(createError);
    const { error } = await signIn.resetPasswordEmailCode.sendCode();
    if (error) return void fail(error);
    changeMode("code");
    setCooldown(RESEND_AFTER);
    setNotice("A reset code is on its way. Check your inbox and spam folder.");
  }

  async function verifyReset(value = code) {
    setFieldErrors({});
    const { error } = await signIn.resetPasswordEmailCode.verifyCode({ code: value.trim() });
    if (error) return void fail(error);
    setNotice(null);
    setMode("new-password");
  }

  async function finishReset() {
    setFieldErrors({});
    if (minLength && newPassword.length < minLength) {
      setFieldErrors({ password: `Use at least ${minLength} characters.` });
      haptic.error();
      return;
    }
    const { error } = await signIn.resetPasswordEmailCode.submitPassword({ password: newPassword });
    if (error) return void fail(error);
    if (signIn.status === "complete") await done();
    else if (signIn.status === "needs_client_trust" || signIn.status === "needs_second_factor") await afterFirstFactor();
    else {
      setPassword("");
      setNewPassword("");
      changeMode("email");
      setNotice("Password updated. You can sign in now.");
    }
  }

  /** A code field that sends itself once all six digits are in. */
  const codeField = (testID: string, onComplete: (value: string) => Promise<void>) => (
    <AuthField
      label="Verification code"
      testID={testID}
      autoFocus
      keyboardType="number-pad"
      autoComplete="one-time-code"
      textContentType="oneTimeCode"
      maxLength={CODE_LENGTH}
      value={code}
      error={fieldErrors.code}
      onChangeText={(text) => {
        const digits = text.replace(/\D/g, "").slice(0, CODE_LENGTH);
        setCode(digits);
        if (fieldErrors.code) setFieldErrors({});
        if (digits.length === CODE_LENGTH && !busy) void request.run(() => onComplete(digits));
      }}
      editable={!busy}
    />
  );

  const headings: Record<Mode, [string, string]> = {
    welcome: ["Your day,\na little lighter.", "Sign in or create your account to begin."],
    email: ["Welcome back", "Sign in with your email and password."],
    forgot: ["Reset your password", "We’ll email you a code to set a new one."],
    code: ["Check your inbox", `Enter the code we sent to ${email}.`],
    "new-password": ["Choose a new password", minLength ? `At least ${minLength} characters, and not one you’ve used before.` : "Make it something you haven’t used before."],
    device: ["Confirm it’s you", `Enter the code we sent to ${email}.`],
  };
  // Each step steps back to the one before it, so no screen needs a row of "back" links.
  const previous: Partial<Record<Mode, Mode>> = { email: "welcome", forgot: "email", code: "forgot", "new-password": "email", device: "email" };
  const back = previous[mode];
  const resendTitle = cooldown > 0 ? `Send again in ${cooldown}s` : "Send again";

  return (
    <AuthLayout
      testID="auth-screen"
      title={headings[mode][0]}
      subtitle={headings[mode][1]}
      hero={mode === "welcome"}
      onBack={back && !busy ? () => changeMode(back) : undefined}
      footer={
        mode === "welcome" ? (
          <AuthLink disabled={busy} testID="goto-sign-up" lead="New here?" title="Create an account" onPress={() => router.push("/(public)/sign-up")} />
        ) : undefined
      }
    >
      {mode === "welcome" ? (
        <>
          <SocialAuthButtons disabled={request.busy || fetchStatus === "fetching"} onPendingChange={setSocialPending} />
          <AuthLink testID="use-email" title="Continue with email" disabled={busy} onPress={() => changeMode("email")} />
        </>
      ) : (
        <View style={{ gap: authLayout.gap }}>
          {(mode === "email" || mode === "forgot") && (
            <AuthField
              label="Email"
              testID="email"
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
              keyboardType="email-address"
              autoComplete="email"
              textContentType="emailAddress"
              value={emailAddress}
              error={fieldErrors.email}
              onChangeText={(text) => {
                setEmailAddress(text);
                if (fieldErrors.email || noAccount) {
                  setFieldErrors(({ email: _, ...rest }) => rest);
                  setNoAccount(false);
                }
              }}
              editable={!busy}
              returnKeyType={mode === "email" ? "next" : "send"}
              submitBehavior={mode === "email" ? "submit" : undefined}
              onSubmitEditing={() => {
                if (mode === "email") passwordRef.current?.focus();
                else if (!busy && email) void request.run(sendReset);
              }}
            />
          )}
          {noAccount && (
            <AuthLink lead="New to Mates?" title="Create an account" disabled={busy} onPress={() => router.push("/(public)/sign-up")} />
          )}
          {mode === "email" && (
            <AuthField
              ref={passwordRef}
              label="Password"
              testID="password"
              secureTextEntry
              autoCapitalize="none"
              autoComplete="current-password"
              textContentType="password"
              value={password}
              error={fieldErrors.password}
              onChangeText={(text) => {
                setPassword(text);
                if (fieldErrors.password) setFieldErrors(({ password: _, ...rest }) => rest);
              }}
              editable={!busy}
              returnKeyType="go"
              onSubmitEditing={() => {
                if (!busy && email && password) void request.run(submit);
              }}
            />
          )}
          {mode === "code" && codeField("reset-code", verifyReset)}
          {mode === "device" && codeField("device-code", verifyDevice)}
          {mode === "new-password" && (
            <AuthField
              label="New password"
              testID="new-password"
              secureTextEntry
              autoFocus
              autoCapitalize="none"
              autoComplete="new-password"
              textContentType="newPassword"
              value={newPassword}
              error={fieldErrors.password}
              hint={minLength && newPassword.length > 0 && newPassword.length < minLength ? `${newPassword.length} of ${minLength} characters` : null}
              onChangeText={(text) => {
                setNewPassword(text);
                if (fieldErrors.password) setFieldErrors({});
              }}
              editable={!busy}
              returnKeyType="go"
              onSubmitEditing={() => {
                if (!busy && newPassword) void request.run(finishReset);
              }}
            />
          )}
          {mode === "email" && <AuthLink title="Forgot password?" align="end" disabled={busy} onPress={() => changeMode("forgot")} />}
          <AuthMessage message={request.error} />
          {!request.error && <AuthMessage message={notice} success />}
          {mode === "email" && (
            <AuthAction testID="sign-in" title="Sign in" loading={request.busy} disabled={busy || !email || !password} onPress={() => void request.run(submit)} />
          )}
          {mode === "forgot" && <AuthAction title="Send code" loading={request.busy} disabled={busy || !email} onPress={() => void request.run(sendReset)} />}
          {mode === "code" && (
            <>
              <AuthAction title="Continue" loading={request.busy} disabled={busy || code.length < CODE_LENGTH} onPress={() => void request.run(() => verifyReset())} />
              <AuthLink lead="Didn’t get it?" title={resendTitle} disabled={busy || cooldown > 0} onPress={() => void request.run(sendReset)} />
            </>
          )}
          {mode === "device" && (
            <>
              <AuthAction testID="verify-device" title="Continue" loading={request.busy} disabled={busy || code.length < CODE_LENGTH} onPress={() => void request.run(() => verifyDevice())} />
              <AuthLink lead="Didn’t get it?" title={resendTitle} disabled={busy || cooldown > 0} onPress={() => void request.run(resendDevice)} />
            </>
          )}
          {mode === "new-password" && (
            <AuthAction title="Update password" loading={request.busy} disabled={busy || !newPassword} onPress={() => void request.run(finishReset)} />
          )}
        </View>
      )}
    </AuthLayout>
  );
}
