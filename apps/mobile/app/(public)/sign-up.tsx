import { useSignUp } from "@clerk/expo";
import { Redirect, useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { AuthLayout } from "../../src/components/auth/auth-layout";
import { AuthAction } from "../../src/components/auth/auth-action";
import {
  AuthDivider,
  AuthField,
  AuthLink,
  AuthMessage,
} from "../../src/components/auth/auth-fields";
import { SocialAuthButtons } from "../../src/components/auth/social-buttons";
import { useAuthRequest } from "../../src/components/auth/use-auth-request";
import { useSession } from "../../src/session/provider";

export default function SignUpScreen() {
  const session = useSession();
  const router = useRouter();
  const { signUp, fetchStatus } = useSignUp();
  const [emailAddress, setEmailAddress] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [socialPending, setSocialPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const request = useAuthRequest();
  const busy = request.busy || fetchStatus === "fetching" || socialPending;
  if (session.status === "authenticated") return <Redirect href="/" />;
  const verifying =
    signUp.status === "missing_requirements" &&
    signUp.unverifiedFields?.includes("email_address");
  async function finish() {
    await signUp.finalize({ navigate: () => router.replace("/") });
  }
  async function submit() {
    const { error } = await signUp.password({
      emailAddress: emailAddress.trim(),
      password,
    });
    if (error) return request.setError(error.message);
    if (signUp.status === "complete") return finish();
    const result = await signUp.verifications.sendEmailCode();
    if (result.error) request.setError(result.error.message);
  }
  async function resend() {
    const { error } = await signUp.verifications.sendEmailCode();
    if (error) request.setError(error.message);
    else
      setNotice("A new code is on its way. Check your inbox and spam folder.");
  }
  async function verify() {
    const { error } = await signUp.verifications.verifyEmailCode({
      code: code.trim(),
    });
    if (error) return request.setError(error.message);
    if (signUp.status === "complete") await finish();
    else
      request.setError(
        "Your email is verified, but your account still needs additional details. Please contact support to finish setup.",
      );
  }
  const toSignIn = () => (router.canGoBack() ? router.back() : router.replace("/(public)/sign-in"));
  return (
    <AuthLayout
      testID="sign-up-screen"
      title={verifying ? "Check your inbox" : "Create your account"}
      subtitle={
        verifying
          ? `Enter the code we sent to ${emailAddress.trim()}.`
          : "Free, and it only takes a moment."
      }
      onBack={busy ? undefined : toSignIn}
      footer={
        verifying ? undefined : (
          <AuthLink
            lead="Already have an account?"
            title="Sign in"
            disabled={busy}
            onPress={toSignIn}
          />
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
            value={code}
            onChangeText={setCode}
            editable={!busy}
          />
          <AuthMessage message={request.error} />
          {!request.error && <AuthMessage message={notice} success />}
          <AuthAction
            testID="verify-sign-up"
            title="Verify email"
            disabled={busy || !code.trim()}
            loading={request.busy}
            onPress={() => void request.run(verify)}
          />
          <AuthLink
            lead="Didn’t get it?"
            title="Send again"
            disabled={busy}
            onPress={() => void request.run(resend)}
          />
        </>
      ) : (
        <>
          <SocialAuthButtons
            disabled={request.busy || fetchStatus === "fetching"}
            onPendingChange={setSocialPending}
          />
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
            onChangeText={setEmailAddress}
            editable={!busy}
            returnKeyType="next"
          />
          <AuthField
            label="Password"
            testID="password"
            secureTextEntry
            autoCapitalize="none"
            autoComplete="new-password"
            textContentType="newPassword"
            value={password}
            onChangeText={setPassword}
            editable={!busy}
            returnKeyType="go"
            onSubmitEditing={() => {
              if (!busy && emailAddress.trim() && password) void request.run(submit);
            }}
          />
          <AuthMessage message={request.error} />
          <AuthAction
            testID="sign-up"
            title="Create account"
            disabled={busy || !emailAddress.trim() || !password}
            loading={request.busy}
            onPress={() => void request.run(submit)}
          />
        </>
      )}
      <View nativeID="clerk-captcha" />
    </AuthLayout>
  );
}
