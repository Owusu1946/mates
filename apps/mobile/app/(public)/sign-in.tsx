import { useSignIn } from "@clerk/expo";
import { Redirect, useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { AuthLayout } from "../../src/components/auth/auth-layout";
import { AuthAction } from "../../src/components/auth/auth-action";
import {
  AuthField,
  AuthLink,
  AuthMessage,
} from "../../src/components/auth/auth-fields";
import { SocialAuthButtons } from "../../src/components/auth/social-buttons";
import { useAuthRequest } from "../../src/components/auth/use-auth-request";
import { useSession } from "../../src/session/provider";
import { authLayout } from "../../src/theme/auth";

type Mode = "welcome" | "email" | "forgot" | "code" | "new-password";
export default function SignInScreen() {
  const session = useSession();
  const router = useRouter();
  const { signIn, fetchStatus } = useSignIn();
  const [emailAddress, setEmailAddress] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [mode, setMode] = useState<Mode>("welcome");
  const [socialPending, setSocialPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const request = useAuthRequest();
  const busy = request.busy || fetchStatus === "fetching" || socialPending;
  if (session.status === "authenticated") return <Redirect href="/" />;

  function changeMode(next: Mode) {
    request.setError(null);
    setNotice(null);
    setCode("");
    setMode(next);
  }
  async function submit() {
    const { error } = await signIn.password({
      emailAddress: emailAddress.trim(),
      password,
    });
    if (error) return request.setError(error.message);
    if (signIn.status === "complete")
      await signIn.finalize({ navigate: () => router.replace("/") });
    else
      request.setError(
        "Your account needs another verification step. Please use your connected Apple or Google account to continue.",
      );
  }
  async function sendReset() {
    const { error: createError } = await signIn.create({
      identifier: emailAddress.trim(),
    });
    if (createError) return request.setError(createError.message);
    const { error } = await signIn.resetPasswordEmailCode.sendCode();
    if (error) return request.setError(error.message);
    setMode("code");
    setNotice("A reset code is on its way. Check your inbox and spam folder.");
  }
  async function verifyReset() {
    const { error } = await signIn.resetPasswordEmailCode.verifyCode({
      code: code.trim(),
    });
    if (error) return request.setError(error.message);
    setNotice(null);
    setMode("new-password");
  }
  async function finishReset() {
    const { error } = await signIn.resetPasswordEmailCode.submitPassword({
      password: newPassword,
    });
    if (error) return request.setError(error.message);
    if (signIn.status === "complete")
      await signIn.finalize({ navigate: () => router.replace("/") });
    else {
      setPassword("");
      setNewPassword("");
      setMode("email");
      setNotice("Password updated. You can sign in now.");
    }
  }
  const headings: Record<Mode, [string, string]> = {
    welcome: [
      "Your day.\nA little lighter.",
      "Meet Cooper. A little help with your ideas, your plans, and everything in between.",
    ],
    email: ["Welcome back", "A fresh conversation is waiting for you."],
    forgot: [
      "Let’s get you back in",
      "Enter your email and we’ll send a code to reset your password.",
    ],
    code: [
      "Check your inbox",
      `Enter the verification code sent to ${emailAddress.trim()}.`,
    ],
    "new-password": [
      "A fresh start",
      "Choose a new password for your Cooper account.",
    ],
  };
  return (
    <AuthLayout
      testID="auth-screen"
      title={headings[mode][0]}
      subtitle={headings[mode][1]}
      compact={mode !== "welcome"}
      footer={
        <AuthLink
          disabled={busy}
          testID="goto-sign-up"
          title="New here? Create an account"
          onPress={() => router.push("/(public)/sign-up")}
        />
      }
    >
      {mode === "welcome" ? (
        <>
          <SocialAuthButtons
            disabled={request.busy || fetchStatus === "fetching"}
            onPendingChange={setSocialPending}
          />
          <AuthAction
            testID="use-email"
            title="Continue with email"
            disabled={busy}
            onPress={() => changeMode("email")}
          />
        </>
      ) : (
        <View style={{ gap: authLayout.gap }}>
          {(mode === "email" || mode === "forgot") && (
            <AuthField
              label="Email address"
              testID="email"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              autoComplete="email"
              textContentType="emailAddress"
              placeholder="you@example.com"
              value={emailAddress}
              onChangeText={setEmailAddress}
              editable={!busy}
            />
          )}
          {mode === "email" && (
            <AuthField
              label="Password"
              testID="password"
              secureTextEntry
              autoCapitalize="none"
              autoComplete="current-password"
              textContentType="password"
              placeholder="Your password"
              value={password}
              onChangeText={setPassword}
              editable={!busy}
              returnKeyType="go"
              onSubmitEditing={() => {
                if (!busy && emailAddress.trim() && password)
                  void request.run(submit);
              }}
            />
          )}
          {mode === "code" && (
            <AuthField
              label="Verification code"
              testID="reset-code"
              keyboardType="number-pad"
              autoComplete="one-time-code"
              textContentType="oneTimeCode"
              placeholder="Enter your code"
              value={code}
              onChangeText={setCode}
              editable={!busy}
            />
          )}
          {mode === "new-password" && (
            <AuthField
              label="New password"
              testID="new-password"
              secureTextEntry
              autoCapitalize="none"
              autoComplete="new-password"
              textContentType="newPassword"
              placeholder="Choose a strong password"
              value={newPassword}
              onChangeText={setNewPassword}
              editable={!busy}
            />
          )}
          <AuthMessage message={request.error} />
          {!request.error && <AuthMessage message={notice} success />}
          {mode === "email" && (
            <>
              <AuthAction
                testID="sign-in"
                title="Sign in"
                loading={request.busy}
                disabled={busy || !emailAddress.trim() || !password}
                onPress={() => void request.run(submit)}
              />
              <AuthLink
                title="Forgot password?"
                disabled={busy}
                onPress={() => changeMode("forgot")}
              />
            </>
          )}
          {mode === "forgot" && (
            <AuthAction
              title="Send reset code"
              loading={request.busy}
              disabled={busy || !emailAddress.trim()}
              onPress={() => void request.run(sendReset)}
            />
          )}
          {mode === "code" && (
            <>
              <AuthAction
                title="Verify code"
                loading={request.busy}
                disabled={busy || !code.trim()}
                onPress={() => void request.run(verifyReset)}
              />
              <AuthLink
                title="Send a new code"
                disabled={busy}
                onPress={() => void request.run(sendReset)}
              />
            </>
          )}
          {mode === "new-password" && (
            <AuthAction
              title="Update password"
              loading={request.busy}
              disabled={busy || !newPassword}
              onPress={() => void request.run(finishReset)}
            />
          )}
          <AuthLink
            title={
              mode === "email" ? "Other ways to sign in" : "Back to sign in"
            }
            disabled={busy}
            onPress={() => changeMode(mode === "email" ? "welcome" : "email")}
          />
        </View>
      )}
    </AuthLayout>
  );
}
