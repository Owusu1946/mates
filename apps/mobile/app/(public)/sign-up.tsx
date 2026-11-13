import { useSignUp } from "@clerk/expo";
import { Redirect, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { View, type TextInput } from "react-native";
import { AuthLayout } from "../../src/components/auth/auth-layout";
import { AuthAction } from "../../src/components/auth/auth-action";
import {
  AuthDivider,
  AuthField,
  AuthLink,
  AuthMessage,
} from "../../src/components/auth/auth-fields";
import { isEmail, readClerkError, usePasswordMinLength, type FieldErrors } from "../../src/components/auth/clerk-errors";
import { SocialAuthButtons } from "../../src/components/auth/social-buttons";
import { useAuthRequest } from "../../src/components/auth/use-auth-request";
import { haptic } from "../../src/haptics";
import { useSession } from "../../src/session/provider";

/** Seconds before another code can be requested, so a tap-happy user doesn't trip rate limits. */
const RESEND_AFTER = 30;
const CODE_LENGTH = 6;

/**
 * Sign-up with email: details first, then the emailed code. The screen moves to the code step only
 * once the password is accepted and the code is actually sent. Clerk can keep a half-made sign-up
 * after a rejected password (email set, password missing), so the step is ours, not inferred from
 * Clerk's status. From the code step the email can be changed without losing anything typed.
 */
export default function SignUpScreen() {
  const session = useSession();
  const router = useRouter();
  const { signUp, fetchStatus } = useSignUp();
  const minLength = usePasswordMinLength();
  const [step, setStep] = useState<"details" | "verify">("details");
  const [emailAddress, setEmailAddress] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [emailTaken, setEmailTaken] = useState(false);
  const [socialPending, setSocialPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
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
  const tooShort = !!minLength && password.length > 0 && password.length < minLength;

  const fail = (error: unknown) => {
    const read = readClerkError(error);
    setFieldErrors(read.fields);
    setEmailTaken(read.codes.includes("form_identifier_exists"));
    request.setError(read.message || null);
    haptic.error();
  };

  async function finish() {
    await signUp.finalize({ navigate: () => router.replace("/") });
  }

  async function submit() {
    setFieldErrors({});
    setEmailTaken(false);
    setNotice(null);
    // Say what's wrong here, before anything is sent, so nobody reaches the code step with a bad password.
    const local: FieldErrors = {};
    if (!isEmail(email)) local.email = "Enter a valid email address.";
    if (minLength && password.length < minLength) local.password = `Use at least ${minLength} characters.`;
    if (local.email || local.password) {
      setFieldErrors(local);
      haptic.error();
      return;
    }
    const { error } = await signUp.password({ emailAddress: email, password });
    if (error) return fail(error);
    if (signUp.status === "complete") return finish();
    if (signUp.missingFields?.includes("password")) {
      setFieldErrors({ password: "Choose a different password." });
      haptic.error();
      return;
    }
    const sent = await signUp.verifications.sendEmailCode();
    if (sent.error) return fail(sent.error);
    setCode("");
    setStep("verify");
    setCooldown(RESEND_AFTER);
  }

  async function resend() {
    setFieldErrors({});
    const { error } = await signUp.verifications.sendEmailCode();
    if (error) return fail(error);
    setCode("");
    setCooldown(RESEND_AFTER);
    setNotice("A new code is on its way. Check your inbox and spam folder.");
  }

  async function verify(value = code) {
    setFieldErrors({});
    const { error } = await signUp.verifications.verifyEmailCode({ code: value.trim() });
    if (error) return fail(error);
    if (signUp.status === "complete") await finish();
    else
      request.setError(
        "Your email is verified, but your account still needs additional details. Please contact support to finish setup.",
      );
  }

  /** Back to the details with everything kept; submitting again updates this sign-up and sends a fresh code. */
  function changeEmail() {
    request.setError(null);
    setFieldErrors({});
    setNotice(null);
    setCode("");
    setStep("details");
  }

  const toSignIn = () => (router.canGoBack() ? router.back() : router.replace("/(public)/sign-in"));
  const verifying = step === "verify";

  return (
    <AuthLayout
      testID="sign-up-screen"
      title={verifying ? "Check your inbox" : "Create your account"}
      subtitle={verifying ? `Enter the ${CODE_LENGTH}-digit code we sent to ${email}.` : "Free, and it only takes a moment."}
      onBack={busy ? undefined : verifying ? changeEmail : toSignIn}
      footer={
        verifying ? undefined : (
          <AuthLink lead="Already have an account?" title="Sign in" disabled={busy} onPress={toSignIn} />
        )
      }
    >
      {verifying ? (
        <>
          <AuthField
            label="Verification code"
            testID="code"
            autoFocus
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
            maxLength={CODE_LENGTH}
            value={code}
            error={fieldErrors.code}
            onChangeText={(text) => {
              const digits = text.replace(/\D/g, "").slice(0, CODE_LENGTH);
              setCode(digits);
              if (fieldErrors.code) setFieldErrors({});
              // A full code (typed or filled from the keyboard's suggestion) is sent straight away.
              if (digits.length === CODE_LENGTH && !busy) void request.run(() => verify(digits));
            }}
            editable={!busy}
          />
          <AuthMessage message={request.error} />
          {!request.error && <AuthMessage message={notice} success />}
          <AuthAction
            testID="verify-sign-up"
            title="Verify email"
            disabled={busy || code.length < CODE_LENGTH}
            loading={request.busy}
            onPress={() => void request.run(() => verify())}
          />
          <AuthLink
            lead="Didn’t get it?"
            title={cooldown > 0 ? `Send again in ${cooldown}s` : "Send again"}
            disabled={busy || cooldown > 0}
            onPress={() => void request.run(resend)}
          />
          <AuthLink lead="Wrong email?" title="Change it" disabled={busy} onPress={changeEmail} />
        </>
      ) : (
        <>
          <SocialAuthButtons disabled={request.busy || fetchStatus === "fetching"} onPendingChange={setSocialPending} />
          <AuthDivider />
          <AuthField
            label="Email"
            testID="email"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
            autoComplete="email"
            value={emailAddress}
            error={fieldErrors.email}
            onChangeText={(text) => {
              setEmailAddress(text);
              if (fieldErrors.email || emailTaken) {
                setFieldErrors(({ email: _, ...rest }) => rest);
                setEmailTaken(false);
              }
            }}
            editable={!busy}
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => passwordRef.current?.focus()}
          />
          {emailTaken && (
            <AuthLink
              lead="Is this you?"
              title="Sign in instead"
              disabled={busy}
              onPress={toSignIn}
            />
          )}
          <AuthField
            ref={passwordRef}
            label="Password"
            testID="password"
            secureTextEntry
            autoCapitalize="none"
            autoComplete="new-password"
            textContentType="newPassword"
            value={password}
            error={fieldErrors.password}
            hint={minLength ? (tooShort ? `${password.length} of ${minLength} characters` : `At least ${minLength} characters.`) : null}
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
          <AuthMessage message={request.error} />
          <AuthAction
            testID="sign-up"
            title="Create account"
            disabled={busy || !email || !password}
            loading={request.busy}
            onPress={() => void request.run(submit)}
          />
        </>
      )}
      <View nativeID="clerk-captcha" />
    </AuthLayout>
  );
}
