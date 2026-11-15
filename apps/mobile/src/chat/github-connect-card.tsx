import { useAui } from "@assistant-ui/react-native";
import type { WorkflowCard } from "@expojet/api-contract";
import { useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { GitHubMark, useConnectGitHub } from "../connections/github-card";
import { haptic } from "../haptics";
import { useTheme } from "../theme/provider";

/**
 * Shown when a mate was asked to code but can't reach GitHub yet: connect right here, then
 * Continue, which asks the mate to carry on with the request already in the chat.
 */
export function GitHubConnectCard({ state }: { state: WorkflowCard }) {
  const { colors } = useTheme();
  const aui = useAui();
  // Back to the chat after GitHub, not to Apps & connections.
  const { github, busy, connect } = useConnectGitHub("/");
  const [continued, setContinued] = useState(false);
  const mate = state.github?.mate ?? "your mate";
  const connected = (github.data?.repos.length ?? 0) > 0;

  const carryOn = () => {
    haptic.light();
    setContinued(true);
    const composer = aui.thread.composer();
    composer.setText("GitHub is connected. Go ahead.");
    composer.send();
  };

  return (
    <View style={{ marginVertical: 6, gap: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <GitHubMark color={colors.text} size={22} />
        <View style={{ flex: 1, gap: 1 }}>
          <Text style={{ color: colors.text, fontSize: 15, fontFamily: "DMSans_600SemiBold" }}>{connected ? "GitHub connected" : "Connect GitHub"}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 18 }}>
            {connected ? `${mate} can reach ${github.data!.repos.length} ${github.data!.repos.length === 1 ? "repository" : "repositories"}.` : `So ${mate} can open pull requests in your repositories.`}
          </Text>
        </View>
      </View>
      <View style={{ flexDirection: "row", gap: 14, alignItems: "center", paddingLeft: 32 }}>
        {connected ? (
          <Pressable
            accessibilityRole="button"
            disabled={continued}
            onPress={carryOn}
            style={({ pressed }) => ({ height: 32, paddingHorizontal: 14, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: colors.text, opacity: continued ? 0.4 : pressed ? 0.75 : 1 })}
          >
            <Text style={{ color: colors.background, fontFamily: "DMSans_600SemiBold", fontSize: 13.5 }}>{continued ? "Continuing…" : "Continue"}</Text>
          </Pressable>
        ) : (
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => void connect()}
            style={({ pressed }) => ({ height: 32, paddingHorizontal: 14, borderRadius: 16, flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center", backgroundColor: colors.text, opacity: pressed ? 0.75 : 1 })}
          >
            {busy && <ActivityIndicator size="small" color={colors.background} />}
            <Text style={{ color: colors.background, fontFamily: "DMSans_600SemiBold", fontSize: 13.5 }}>Connect GitHub</Text>
          </Pressable>
        )}
        {connected && !continued && (
          <Pressable accessibilityRole="button" hitSlop={8} disabled={busy} onPress={() => void connect()} style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
            <Text style={{ color: colors.textSecondary, fontFamily: "DMSans_500Medium", fontSize: 13.5 }}>Change repositories</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}
