import { useState } from "react";
import { Text, View } from "react-native";
import { WebView } from "react-native-webview";
import { useTheme } from "../theme/provider";

/**
 * The mates' desktop, live (noVNC in a WebView). Touches reach it only while the user has taken
 * over; the server also hands out a view-only link until then. The WebView reloads only when the
 * link itself changes, so polling never restarts the stream.
 */
export function LiveView({ url, interactive, height, placeholder }: { url: string | null; interactive: boolean; height: number; placeholder?: string }) {
  const { isDark } = useTheme();
  const [failed, setFailed] = useState<string | null>(null);
  const muted = isDark ? "#a1a1aa" : "#71717a";
  return (
    <View
      pointerEvents={interactive ? "auto" : "none"}
      style={{ height, borderRadius: 14, overflow: "hidden", backgroundColor: isDark ? "#09090b" : "#18181b", alignItems: "center", justifyContent: "center" }}
    >
      {url ? (
        <WebView
          key={url}
          source={{ uri: url }}
          style={{ flex: 1, width: "100%", height, backgroundColor: "transparent" }}
          originWhitelist={["https://*"]}
          javaScriptEnabled
          domStorageEnabled
          scrollEnabled={false}
          bounces={false}
          allowsInlineMediaPlayback
          onLoadStart={() => setFailed(null)}
          onError={() => setFailed("The live view disconnected. It reconnects on its own when the computer is on.")}
        />
      ) : (
        <Text style={{ color: muted, fontSize: 13, paddingHorizontal: 20, textAlign: "center" }}>{placeholder ?? "The computer is off. It turns on when a mate starts a task."}</Text>
      )}
      {!!failed && (
        <Text style={{ position: "absolute", bottom: 8, left: 12, right: 12, color: "#fafafa", fontSize: 12, textAlign: "center" }}>{failed}</Text>
      )}
    </View>
  );
}
