import { useAuth } from "@clerk/expo";
import { useQuery } from "@tanstack/react-query";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { CardButton } from "../chat/card-button";
import { runRequest } from "../chat/background-chat";
import { haptic } from "../haptics";

/** What went wrong, in words that say what to do next. Keyed by the API's failure reason. */
const FAILURES: Record<string, string> = {
  expired: "That took a little too long. Try connecting again.",
  config: "GitHub sign-in isn’t finished on the server yet (the App’s client ID and secret).",
  oauth: "GitHub didn’t accept the sign-in. Check the App’s client secret and callback URL, then try again.",
  not_installed: "Install the bot on your GitHub account first, then try again.",
};

type GitHubState = { configured: boolean; installations: { id: number; account: string }[]; repos: { fullName: string; private: boolean }[] };

export function useGitHub() {
  const { getToken, userId } = useAuth();
  return useQuery({ queryKey: ["github", userId], enabled: !!userId, queryFn: () => runRequest<GitHubState>(getToken, "github") });
}

function GitHubMark({ color, size = 26 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        fill={color}
        d="M12 .5C5.65.5.5 5.65.5 12a11.5 11.5 0 0 0 7.86 10.92c.58.1.79-.25.79-.56v-2c-3.2.7-3.87-1.37-3.87-1.37-.53-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.42-2.7 5.4-5.26 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z"
      />
    </Svg>
  );
}

/** Lets the mates' bot into the user's GitHub so it can ship code and open pull requests. */
export function GitHubCard({ isDark }: { isDark: boolean }) {
  const { getToken } = useAuth();
  const github = useGitHub();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!github.data?.configured) return null;

  const foreground = isDark ? "#fafafa" : "#18181b";
  const muted = isDark ? "#a1a1aa" : "#71717a";
  const connected = github.data.installations.length > 0;
  const repos = github.data.repos.length;

  // The same GitHub page installs the bot or, once installed, changes which repos it can reach.
  const open = async () => {
    setBusy(true);
    setError(null);
    haptic.light();
    try {
      // GitHub hands back to this link (mates:// in builds, exp:// in Expo Go), closing the sheet.
      const returnTo = Linking.createURL("connections");
      const { url } = await runRequest<{ url: string }>(getToken, `github/install?returnTo=${encodeURIComponent(returnTo)}`);
      const result = await WebBrowser.openAuthSessionAsync(url, returnTo);
      if (result.type === "success" && result.url.includes("github=failed")) {
        const reason = /[?&]reason=([a-z_]+)/.exec(result.url)?.[1] ?? "";
        setError(FAILURES[reason] ?? "GitHub didn’t confirm the connection. Try again.");
      }
      await github.refetch();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn’t open GitHub.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ padding: 12, borderRadius: 15, gap: 7, backgroundColor: isDark ? "#202023" : "#f7f7f8" }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 11 }}>
        <GitHubMark color={foreground} size={22} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: foreground, fontSize: 15, fontFamily: "DMSans_600SemiBold" }}>GitHub</Text>
          <Text numberOfLines={1} style={{ color: muted, fontSize: 12, lineHeight: 16 }}>
            {connected
              ? `${github.data.installations.map((item) => item.account).join(", ")} · ${repos} repo${repos === 1 ? "" : "s"}`
              : "Not connected"}
          </Text>
        </View>
      {busy ? <ActivityIndicator color={foreground} size="small" /> : <CardButton label={connected ? "Choose repos" : "Connect"} variant="outlined" disabled={busy} onPress={() => void open()} />}
      </View>
      {error && <Text style={{ color: isDark ? "#fda4af" : "#be123c", fontSize: 13 }}>{error}</Text>}
    </View>
  );
}
