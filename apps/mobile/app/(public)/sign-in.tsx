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
    welcome: ["Your day,\na little lighter.", "Sign in or create your account to begin."],
    email: ["Welcome back", "Sign in with your email and password."],
    forgot: ["Reset your password", "We’ll email you a code to set a new one."],
    code: ["Check your inbox", `Enter the code we sent to ${emailAddress.trim()}.`],
    "new-password": ["Choose a new password", "Make it something you haven’t used before."],
  };
  // Each step steps back to the one before it, so no screen needs a row of "back" links.
  const previous: Partial<Record<Mode, Mode>> = { email: "welcome", forgot: "email", code: "forgot", "new-password": "email" };
  const back = previous[mode];
  return (
    <AuthLayout
      testID="auth-screen"
      title={headings[mode][0]}
      subtitle={headings[mode][1]}
      hero={mode === "welcome"}
      onBack={back && !busy ? () => changeMode(back) : undefined}
      footer={
        mode === "welcome" ? (
          <AuthLink
            disabled={busy}
            testID="goto-sign-up"
            lead="New here?"
            title="Create an account"
            onPress={() => router.push("/(public)/sign-up")}
          />
        ) : undefined
      }
    >
      {mode === "welcome" ? (
        <>
          <SocialAuthButtons
            disabled={request.busy || fetchStatus === "fetching"}
            onPendingChange={setSocialPending}
          />
          <AuthLink
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
              label="Email"
              testID="email"
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
              keyboardType="email-address"
              autoComplete="email"
              textContentType="emailAddress"
              value={emailAddress}
              onChangeText={setEmailAddress}
              editable={!busy}
              returnKeyType={mode === "email" ? "next" : "send"}
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
              autoFocus
              keyboardType="number-pad"
              autoComplete="one-time-code"
              textContentType="oneTimeCode"
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
              autoFocus
              autoCapitalize="none"
              autoComplete="new-password"
              textContentType="newPassword"
              value={newPassword}
              onChangeText={setNewPassword}
              editable={!busy}
            />
          )}
          {mode === "email" && (
            <AuthLink
              title="Forgot password?"
              align="end"
              disabled={busy}
              onPress={() => changeMode("forgot")}
            />
          )}
          <AuthMessage message={request.error} />
          {!request.error && <AuthMessage message={notice} success />}
          {mode === "email" && (
            <AuthAction
              testID="sign-in"
              title="Sign in"
              loading={request.busy}
              disabled={busy || !emailAddress.trim() || !password}
              onPress={() => void request.run(submit)}
            />
          )}
          {mode === "forgot" && (
            <AuthAction
              title="Send code"
              loading={request.busy}
              disabled={busy || !emailAddress.trim()}
              onPress={() => void request.run(sendReset)}
            />
          )}
          {mode === "code" && (
            <>
              <AuthAction
                title="Continue"
                loading={request.busy}
                disabled={busy || !code.trim()}
                onPress={() => void request.run(verifyReset)}
              />
              <AuthLink
                lead="Didn’t get it?"
                title="Send again"
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
        </View>
      )}
    </AuthLayout>
  );
}
