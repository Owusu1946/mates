import { useAuth } from "@clerk/expo";
import { useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { runRequest } from "../../src/chat/background-chat";
import { useTheme } from "../../src/theme/provider";

/**
 * Opened from the "Connect your Mates account" button the bot sends in Slack
 * (mates://slack-link?token=…): links that Slack user to whoever is signed in here.
 */
export default function SlackLinkScreen() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const { getToken } = useAuth();
  const { isDark } = useTheme();
  const queryClient = useQueryClient();
  const [state, setState] = useState<{ kind: "working" } | { kind: "done"; team: string } | { kind: "failed"; message: string }>({ kind: "working" });

  useEffect(() => {
    if (!token) return setState({ kind: "failed", message: "This link is missing its code. Ask Mates in Slack for a new one." });
    runRequest<{ team: string }>(getToken, "slack/link", { token })
      .then(({ team }) => {
        setState({ kind: "done", team });
        void queryClient.invalidateQueries({ queryKey: ["slack"] });
      })
      .catch((error) => setState({ kind: "failed", message: error instanceof Error ? error.message : "Couldn’t connect Slack." }));
  }, [token, getToken, queryClient]);

  const foreground = isDark ? "#fafafa" : "#18181b";
  const muted = isDark ? "#a1a1aa" : "#71717a";
  return (
    <View style={{ flex: 1, padding: 28, justifyContent: "center", gap: 14, backgroundColor: isDark ? "#09090b" : "#ffffff" }}>
      {state.kind === "working" ? (
        <ActivityIndicator color={muted} />
      ) : (
        <>
          <Text style={{ color: foreground, fontSize: 27, letterSpacing: -0.7, fontFamily: "DMSans_600SemiBold" }}>{state.kind === "done" ? "Slack is connected." : "That didn’t work."}</Text>
          <Text style={{ color: muted, fontSize: 15, lineHeight: 22, fontFamily: "DMSans_400Regular" }}>
            {state.kind === "done" ? `Your mates now answer you in ${state.team}. Mention @Mates and say which mate you need.` : state.message}
          </Text>
          <Pressable accessibilityRole="button" onPress={() => router.replace("/connections")} style={({ pressed }) => ({ marginTop: 10, minHeight: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: foreground, opacity: pressed ? 0.7 : 1 })}>
            <Text style={{ color: isDark ? "#18181b" : "#fafafa", fontSize: 15, fontFamily: "DMSans_600SemiBold" }}>Done</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}
