import { useAuth } from "@clerk/expo";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActionSheetIOS, ActivityIndicator, Alert, Linking, Platform, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import { resolveApiUrl } from "../../../src/chat/chat-model";
import { ChatIcon } from "../../../src/chat/chat-icon";
import { haptic } from "../../../src/haptics";
import { pageBusy, usePage, usePageActions } from "../../../src/pages/use-page";
import { useTheme } from "../../../src/theme/provider";

/**
 * A page full screen: the same renderer as the public link, loaded with the user's sign-in so a
 * private page shows too. It reloads itself when a new version lands. Share, stop sharing and undo
 * are in the header; changes are asked for in the chat.
 */
export default function PageScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { getToken } = useAuth();
  const live = usePage(id);
  const actions = usePageActions(id);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const page = live.data?.page;
  const busy = pageBusy(page?.status);

  useEffect(() => {
    void getToken().then(setToken).catch(() => setToken(null));
  }, [getToken, page?.version]);

  const more = () => {
    if (!page) return;
    haptic.light();
    const options = [page.visibility === "link" ? "Stop sharing" : "Share", ...(page.version > 1 ? ["Undo last change"] : []), "Change it in the chat", "Cancel"];
    const run = (label: string | undefined) => {
      if (label === "Share") void actions.share(page.title);
      else if (label === "Stop sharing") void actions.unshare();
      else if (label === "Undo last change") void actions.undo();
      else if (label === "Change it in the chat") router.back();
    };
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions({ options, cancelButtonIndex: options.length - 1, destructiveButtonIndex: page.visibility === "link" ? 0 : undefined }, (i) => run(options[i]));
    } else {
      Alert.alert(page.title, undefined, [...options.slice(0, -1).map((label) => ({ text: label, onPress: () => run(label) })), { text: "Cancel", style: "cancel" as const }]);
    }
  };

  const api = resolveApiUrl();
  const source = api && token && page ? { uri: `${api}/v1/pages/${id}/html?v=${page.version}`, headers: { authorization: `Bearer ${token}` } } : null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ paddingTop: insets.top + 6, paddingHorizontal: 12, paddingBottom: 8, flexDirection: "row", alignItems: "center", gap: 8, borderBottomWidth: 0.5, borderBottomColor: colors.border }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={10} onPress={() => router.back()} style={{ padding: 6 }}>
          <ChatIcon name="close" color={colors.text} size={22} />
        </Pressable>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text numberOfLines={1} style={{ color: colors.text, fontFamily: "DMSans_600SemiBold", fontSize: 15.5 }}>{page?.title ?? "Page"}</Text>
          <Text style={{ color: colors.textMuted, fontFamily: "DMSans_400Regular", fontSize: 12 }}>{busy ? "Updating…" : page?.visibility === "link" ? "Shared by link" : "Private"}</Text>
        </View>
        {page?.visibility === "link" && page.url ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Share the link" hitSlop={10} onPress={() => void actions.openShareSheet(page.title, page.url!)} style={{ padding: 6 }}>
            <ChatIcon name="share" color={colors.text} size={21} />
          </Pressable>
        ) : null}
        <Pressable accessibilityRole="button" accessibilityLabel="More" hitSlop={10} onPress={more} disabled={!page} style={{ padding: 6 }}>
          <ChatIcon name="more" color={colors.text} size={22} />
        </Pressable>
      </View>

      <View style={{ flex: 1 }}>
        {source ? (
          <WebView
            key={source.uri}
            source={source}
            style={{ flex: 1, backgroundColor: colors.background }}
            originWhitelist={["https://*", "http://*"]}
            onLoadEnd={() => setLoading(false)}
            onLoadStart={() => setLoading(true)}
            setSupportMultipleWindows={false}
            allowsLinkPreview={false}
            // Links inside the page (sources, cards) open in the browser, not in this view.
            onShouldStartLoadWithRequest={(request) => {
              if (request.url.startsWith(`${api}/v1/pages/`) || request.url.startsWith("about:") || request.url.includes("#")) return true;
              void Linking.openURL(request.url);
              return false;
            }}
          />
        ) : null}
        {(loading || !source) && (
          <View pointerEvents="none" style={{ position: "absolute", inset: 0, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
            {live.isError ? (
              <Text style={{ color: colors.textSecondary, fontFamily: "DMSans_400Regular", fontSize: 15 }}>Couldn’t open this page.</Text>
            ) : (
              <ActivityIndicator />
            )}
          </View>
        )}
      </View>
    </View>
  );
}
