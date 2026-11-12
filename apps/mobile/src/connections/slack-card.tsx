import { useAuth } from "@clerk/expo";
import { useQuery } from "@tanstack/react-query";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { runRequest } from "../chat/background-chat";
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
    <View style={{ padding: 16, borderRadius: 20, gap: 14, backgroundColor: isDark ? "#27272a" : "#f4f4f5" }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <SlackMark color={foreground} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: foreground, fontSize: 17, fontFamily: "DMSans_600SemiBold" }}>Slack</Text>
          <Text style={{ color: muted, fontSize: 13, lineHeight: 18 }}>
            {connected ? slack.data.workspaces.map((workspace) => workspace.name).join(", ") : "Mention @Mates in any channel, and your mates reply as themselves"}
          </Text>
        </View>
      </View>
      <Pressable
        accessibilityRole="button"
        disabled={busy}
        onPress={() => void open()}
        style={({ pressed }) => ({ minHeight: 46, borderRadius: 23, alignItems: "center", justifyContent: "center", backgroundColor: connected ? "transparent" : foreground, borderWidth: connected ? 1 : 0, borderColor: muted, opacity: pressed || busy ? 0.6 : 1 })}
      >
        {busy ? (
          <ActivityIndicator color={connected ? foreground : isDark ? "#18181b" : "#fafafa"} />
        ) : (
          <Text style={{ color: connected ? foreground : isDark ? "#18181b" : "#fafafa", fontSize: 15, fontFamily: "DMSans_600SemiBold" }}>{connected ? "Add to another workspace" : "Add to Slack"}</Text>
        )}
      </Pressable>
      {error && <Text style={{ color: isDark ? "#fda4af" : "#be123c", fontSize: 13 }}>{error}</Text>}
    </View>
  );
}
