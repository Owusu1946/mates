import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { WebView, type WebViewMessageEvent } from "react-native-webview";

/** The desktop's own backdrop, so letterboxing and loading never flash white. */
export const STAGE = "#09090b";

type Link = "loading" | "connecting" | "connected" | "reconnecting" | "disconnected";

/**
 * Runs inside noVNC's page: hides its own chrome (we draw ours), and reports the connection state,
 * which noVNC keeps as classes on <html>. noVNC drops every class after a disconnect.
 */
const INJECT = `(function () {
  var style = document.createElement("style");
  style.textContent = "#noVNC_control_bar_anchor,#noVNC_status,#noVNC_connect_dlg,#noVNC_transition{display:none!important}" +
    "html,body,#noVNC_container{background:${STAGE}!important}body{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}";
  document.head.appendChild(style);
  var last = "", seen = false;
  function report() {
    var c = document.documentElement.className;
    var s = /noVNC_connected/.test(c) ? "connected" : /noVNC_reconnecting/.test(c) ? "reconnecting" : /noVNC_connecting/.test(c) ? "connecting" : seen ? "disconnected" : "loading";
    if (s === "connected") seen = true;
    if (s !== last) { last = s; window.ReactNativeWebView.postMessage(JSON.stringify({ type: "link", state: s })); }
  }
  new MutationObserver(report).observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  report();
  setInterval(report, 1500);
})(); true;`;

const viewOnly = (url: string) => url.includes("view_only=true");
/** How long without a picture before the view reloads itself, growing with each try. */
const watchdogMs = (attempt: number) => Math.min(30_000, 10_000 + attempt * 10_000);

/**
 * The mates' desktop, live (noVNC in a WebView). Touches reach it only while `interactive`; the
 * server also hands out a view-only link until then. A fresh link for the same mode never restarts
 * a stream that's already playing; a change of mode (take over, hand back) does. If the picture is
 * lost, it reloads itself with the newest link, backing off, and asks the parent for a fresh one.
 */
export function LiveView({ url, interactive, height, width, onStale }: {
  url: string | null;
  interactive: boolean;
  height: number;
  width?: number;
  /** The stream is stuck: the link may have expired, so fetch a new one. */
  onStale?: () => void;
}) {
  const [active, setActive] = useState(url);
  const [link, setLink] = useState<Link>("loading");
  const [attempt, setAttempt] = useState(0);
  const linkRef = useRef(link);
  linkRef.current = link;
  const latest = useRef(url);
  latest.current = url;

  useEffect(() => {
    setActive((current) => {
      if (!url) return null;
      if (current && viewOnly(current) === viewOnly(url) && linkRef.current === "connected") return current;
      return url;
    });
  }, [url]);
  useEffect(() => {
    setLink("loading");
  }, [active]);

  // No picture for a while: reload with the newest link.
  useEffect(() => {
    if (!active || link === "connected") return;
    const timer = setTimeout(() => {
      onStale?.();
      setAttempt((n) => n + 1);
      setActive(latest.current);
    }, watchdogMs(attempt));
    return () => clearTimeout(timer);
  }, [active, link, attempt, onStale]);
  useEffect(() => {
    if (link === "connected") setAttempt(0);
  }, [link]);

  const onMessage = (event: WebViewMessageEvent) => {
    try {
      const message = JSON.parse(event.nativeEvent.data) as { type?: string; state?: Link };
      if (message.type === "link" && message.state) setLink(message.state);
    } catch {
      // Not ours.
    }
  };
  const lost = () => {
    setLink("disconnected");
    onStale?.();
  };

  return (
    <View pointerEvents={interactive ? "auto" : "none"} style={{ height, width: width ?? "100%", backgroundColor: STAGE }}>
      {active && (
        <WebView
          key={`${active}#${attempt}`}
          source={{ uri: active }}
          style={{ flex: 1, backgroundColor: STAGE }}
          containerStyle={{ backgroundColor: STAGE }}
          originWhitelist={["https://*"]}
          injectedJavaScript={INJECT}
          onMessage={onMessage}
          javaScriptEnabled
          domStorageEnabled
          scrollEnabled={false}
          bounces={false}
          overScrollMode="never"
          setSupportMultipleWindows={false}
          allowsBackForwardNavigationGestures={false}
          allowsLinkPreview={false}
          textZoom={100}
          mixedContentMode="never"
          // The page never leaves the desktop's own host.
          onShouldStartLoadWithRequest={(request) => {
            try { return new URL(request.url).host === new URL(active).host; } catch { return false; }
          }}
          onError={lost}
          onHttpError={lost}
          onRenderProcessGone={lost}
          onContentProcessDidTerminate={lost}
        />
      )}
      {link !== "connected" && (
        <Animated.View
          entering={FadeIn.duration(150)}
          exiting={FadeOut.duration(350)}
          pointerEvents="none"
          style={{ position: "absolute", inset: 0, alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: STAGE }}
        >
          <ActivityIndicator color="#a1a1aa" />
          <Text style={{ color: "#a1a1aa", fontFamily: "DMSans_500Medium", fontSize: 13 }}>
            {!active ? "Getting the screen ready…" : link === "reconnecting" || link === "disconnected" || attempt > 0 ? "Reconnecting to the screen…" : "Connecting to the screen…"}
          </Text>
          {attempt >= 2 && <Text style={{ color: "#71717a", fontSize: 12, textAlign: "center", paddingHorizontal: 24 }}>This is taking longer than usual. Check your connection.</Text>}
        </Animated.View>
      )}
    </View>
  );
}
