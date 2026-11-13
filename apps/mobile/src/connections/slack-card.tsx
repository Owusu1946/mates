import { useAuth } from "@clerk/expo";
import { useQuery } from "@tanstack/react-query";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, Text, View } from "react-native";
import { runRequest } from "../chat/background-chat";
import { resolveApiUrl } from "../chat/chat-model";
import { haptic } from "../haptics";

/** What went wrong, in words that say what to do next. Keyed by the API's failure reason. */
const FAILURES: Record<string, string> = {
  expired: "That took a little too long. Try adding Mates again.",
  cancelled: "Slack wasn’t connected. Tap Add to Slack when you’re ready.",
  oauth: "Slack didn’t accept the install. Try again in a moment.",
};

type SlackState = { configured: boolean; workspaces: { id: string; name: string }[] };

export function useSlack() {
  const { getToken, userId } = useAuth();
  return useQuery({ queryKey: ["slack", userId], enabled: !!userId, queryFn: () => runRequest<SlackState>(getToken, "slack") });
}

/** Slack's mark kept to one colour, like the GitHub card: a hash in a rounded square. */
function SlackMark({ color }: { color: string }) {
  return (
    <View style={{ width: 26, height: 26, borderRadius: 7, borderWidth: 2, borderColor: color, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color, fontSize: 15, lineHeight: 18, fontFamily: "DMSans_600SemiBold" }}>#</Text>
    </View>
  );
}

/** Adds the mates to a Slack workspace, where they answer in threads under their own names. */
export function SlackCard({ isDark }: { isDark: boolean }) {
  const { getToken } = useAuth();
  const slack = useSlack();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!slack.data?.configured) return null;

  const foreground = isDark ? "#fafafa" : "#18181b";
  const muted = isDark ? "#a1a1aa" : "#71717a";
  const connected = slack.data.workspaces.length > 0;

  /** Unlinks this person from one workspace; the workspace's install stays for its other members. */
  const disconnect = (workspace: { id: string; name: string }) =>
    Alert.alert(`Disconnect ${workspace.name}?`, "Your mates will stop answering you in this Slack workspace.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Disconnect",
        style: "destructive",
        onPress: async () => {
          setError(null);
          try {
            const [base, token] = [resolveApiUrl(), await getToken()];
            const response = base && token ? await fetch(`${base}/v1/slack/link/${encodeURIComponent(workspace.id)}`, { method: "DELETE", headers: { authorization: `Bearer ${token}` } }) : null;
            if (!response?.ok) throw new Error("Couldn’t disconnect Slack. Try again.");
            haptic.light();
            await slack.refetch();
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : "Couldn’t disconnect Slack.");
          }
        },
      },
    ]);

  const open = async () => {
    setBusy(true);
    setError(null);
    haptic.light();
    try {
      // Slack hands back to this link (mates:// in builds, exp:// in Expo Go), closing the sheet.
      const returnTo = Linking.createURL("connections");
      const { url } = await runRequest<{ url: string }>(getToken, `slack/install?returnTo=${encodeURIComponent(returnTo)}`);
      const result = await WebBrowser.openAuthSessionAsync(url, returnTo);
      if (result.type === "success" && result.url.includes("slack=failed")) {
        const reason = /[?&]reason=([a-z_]+)/.exec(result.url)?.[1] ?? "";
        setError(FAILURES[reason] ?? "Slack didn’t confirm the install. Try again.");
      }
      await slack.refetch();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn’t open Slack.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ padding: 13, borderRadius: 16, gap: 9, backgroundColor: isDark ? "#27272a" : "#f4f4f5" }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <SlackMark color={foreground} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: foreground, fontSize: 17, fontFamily: "DMSans_600SemiBold" }}>Slack</Text>
          <Text numberOfLines={1} style={{ color: muted, fontSize: 12, lineHeight: 16 }}>
            {connected ? slack.data.workspaces.map((workspace) => workspace.name).join(", ") : "Mention @Mates in any channel, and your mates reply as themselves"}
          </Text>
        </View>
      </View>
      <Pressable
        accessibilityRole="button"
        disabled={busy}
        onPress={() => void open()}
        style={({ pressed }) => ({ minHeight: 36, alignSelf: "flex-start", paddingHorizontal: 13, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: connected ? "transparent" : foreground, borderWidth: connected ? 1 : 0, borderColor: muted, opacity: pressed || busy ? 0.6 : 1 })}
      >
        {busy ? (
          <ActivityIndicator color={connected ? foreground : isDark ? "#18181b" : "#fafafa"} />
        ) : (
          <Text style={{ color: connected ? foreground : isDark ? "#18181b" : "#fafafa", fontSize: 13, fontFamily: "DMSans_600SemiBold" }}>{connected ? "Add workspace" : "Add to Slack"}</Text>
        )}
      </Pressable>
      {slack.data.workspaces.map((workspace) => (
        <View key={workspace.id} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ color: foreground, fontSize: 14, fontFamily: "DMSans_400Regular" }}>{workspace.name}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={`Disconnect ${workspace.name}`} hitSlop={8} onPress={() => disconnect(workspace)}>
            <Text style={{ color: isDark ? "#fda4af" : "#be123c", fontSize: 14, fontFamily: "DMSans_600SemiBold" }}>Disconnect</Text>
          </Pressable>
        </View>
      ))}
      {error && <Text style={{ color: isDark ? "#fda4af" : "#be123c", fontSize: 13 }}>{error}</Text>}
    </View>
  );
}
