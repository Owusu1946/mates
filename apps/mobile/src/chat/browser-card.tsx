import { useAuth } from "@clerk/expo";
import { useAui, useAuiState } from "@assistant-ui/react-native";
import type { WorkflowCard } from "@expojet/api-contract";
import { useEffect, useMemo, useRef, useState } from "react";
import { Modal, Text, TextInput, View, ScrollView } from "react-native";
import { WebView } from "react-native-webview";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { createApiClient } from "../data/api";
import { useTheme } from "../theme/provider";
import { useMateName } from "../mates/data";
import { CardButton } from "./card-button";

type LiveState = WorkflowCard & { previewUrl?: string | null };
const ended = ["completed", "cancelled", "expired", "error", "blocked"];
export function BrowserCard({ state }: { state: WorkflowCard }) {
  const { getToken } = useAuth();
  const token = useRef(getToken); token.current = getToken;
  const api = useMemo(() => createApiClient(() => token.current()), []);
  const aui = useAui();
  const running = useAuiState(s => s.thread.isRunning);
  const { isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const mateName = useMateName();
  const [live, setLive] = useState<LiveState>(state);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [privateInput, setPrivateInput] = useState(true);
  const [pending, setPending] = useState(false);
  const [choice, setChoice] = useState<string | null>(null);
  const submitted = useRef(false);
  const foreground = isDark ? "#fafafa" : "#18181b";
  const background = isDark ? "#232326" : "#fafafa";
  const muted = isDark ? "#a1a1aa" : "#71717a";
  const border = isDark ? "#3f3f46" : "#e4e4e7";
  const id = state.browserSessionId;
  useEffect(() => {
    setLive(old => ({ ...old, ...state }));
    if (!id) return;
    let alive = true;
    const refresh = async () => {
      try {
        const response = await api.v1.browser[":id"].$get({ param: { id } });
        if (!response.ok) throw new Error(`This browser has ended. Ask ${mateName} to start again.`);
        const data = await response.json();
        if (alive && "browserSessionId" in data) { setLive(data); setError(null); }
      } catch (e) { if (alive) setError(e instanceof Error ? e.message : "Live view unavailable"); }
    };
    void refresh();
    const interval = ended.includes(state.browserStatus ?? "") ? undefined : setInterval(refresh, 2500);
    return () => { alive = false; if (interval) clearInterval(interval); };
  }, [api, id, state]);
  useEffect(() => {
    if (!choice || running || submitted.current || !state.resumeRunId) return;
    submitted.current = true;
    setExpanded(false); setInput("");
    aui.message.reload({ runConfig: { custom: { resumeRunId: state.resumeRunId, choice } } });
  }, [choice, running, state.resumeRunId, aui]);
  useEffect(() => { if (live.browserStatus === "running") { submitted.current = false; setChoice(null); } }, [live.browserStatus]);
  const status = live.browserStatus ?? state.browserStatus ?? "running";
  const terminal = ended.includes(status);
  const canControl = !running && ["login", "user_control", "verification"].includes(status);
  async function command(action: "pause" | "close" | "input", key?: "Enter" | "Tab" | "Backspace" | "Escape") {
    if (!id || pending) return;
    setPending(true); setError(null);
    if (action === "close" && running) aui.thread.cancelRun();
    try {
      const response = action === "pause" ? await api.v1.browser[":id"].pause.$post({ param: { id } }) : action === "close" ? await api.v1.browser[":id"].close.$post({ param: { id } }) : await api.v1.browser[":id"].input.$post({ param: { id }, json: key ? { key } : { text: input } });
      if (!response.ok) throw new Error(action === "input" ? "Couldn’t enter text. Tap the website field first." : "This browser is unavailable. Start a fresh request.");
      if (action === "input") setInput("");
      if (action === "close") { setLive(v => ({ ...v, browserStatus: "cancelled", previewUrl: null })); setExpanded(false); }
      if (action === "pause") { setLive(v => ({ ...v, browserStatus: "user_control" })); setExpanded(true); }
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn’t update browser"); } finally { setPending(false); }
  }
  const button = (label: string, onPress: () => void, disabled = false) => (
    <CardButton key={label} label={label} onPress={onPress} disabled={disabled || pending} />
  );
  const preview = (height: number) => live.previewUrl && !terminal ? <View style={{ height, borderRadius: 14, overflow: "hidden", backgroundColor: isDark ? "#18181b" : "#fff" }} pointerEvents={canControl ? "auto" : "none"}>
    <WebView source={{ uri: live.previewUrl }} style={{ flex: 1, width: "100%", height }} originWhitelist={["*"]} javaScriptEnabled domStorageEnabled thirdPartyCookiesEnabled allowsInlineMediaPlayback mediaPlaybackRequiresUserAction={false}
      onError={() => setError("Live view disconnected. The session may have expired.")}
      onMessage={event => { if (event.nativeEvent.data.includes("browserbase-disconnected")) setError("Live view disconnected."); }}
      injectedJavaScript={`window.addEventListener('message',function(e){if(e.data==='browserbase-disconnected')window.ReactNativeWebView.postMessage(e.data);});true;`} />
  </View> : <View style={{ padding: 20 }}><Text style={{ color: muted }}>{terminal ? status === "completed" ? "Browser session finished." : status === "blocked" ? "The website denied access. Its content could not be verified." : status === "expired" ? "This browser expired. Start a fresh request to continue." : status === "cancelled" ? "Browser stopped." : "The browser could not complete this step." : "Preparing the live view…"}</Text></View>;
  const controls = <View style={{ gap: 12 }}>
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
      {!terminal && status === "running" && button("Take control", () => { void command("pause"); })}
      {canControl && button(status === "verification" ? "Verification done · Continue" : `Continue with ${mateName}`, () => setChoice("continue"))}
      {status === "verification" && button("Try another site", () => setChoice("alternative"), running)}
      {status === "approval" && <>{button("Confirm action", () => setChoice("approve"), running)}{button("Decline", () => setChoice("decline"), running)}</>}
      {!terminal && button("End browser", () => { void command("close"); })}
    </View>
    {status === "user_control" && running && <Text style={{ color: muted }}>Pausing after the current step…</Text>}
    {status === "verification" && <Text style={{ color: muted, fontSize: 13, lineHeight: 19 }}>Complete the challenge in the live page, then continue. {mateName} will check that access was restored.</Text>}
    {canControl && status !== "verification" && <View style={{ gap: 10 }}>
      <Text style={{ color: muted, fontSize: 13 }}>Tap a field in the website, then enter text here. Private input goes directly to that field.</Text>
      <TextInput value={input} onChangeText={setInput} secureTextEntry={privateInput} autoCapitalize="none" autoCorrect={false} placeholder="Type into the selected field" placeholderTextColor={muted} style={{ color: foreground, borderWidth: 1, borderColor: border, borderRadius: 14, padding: 14 }} />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        {button("Enter text", () => { void command("input"); }, !input)}
        {button("Tab", () => { void command("input", "Tab"); })}
        {button("Enter", () => { void command("input", "Enter"); })}
        {button(privateInput ? "Show text" : "Hide text", () => setPrivateInput(v => !v))}
      </View>
    </View>}
  </View>;
  return <View style={{ width: "100%", borderWidth: 1, borderColor: border, borderRadius: 20, padding: 14, gap: 12, marginVertical: 12, backgroundColor: background }}>
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: status === "running" ? "#16a34a" : muted }} />
      <Text numberOfLines={1} style={{ flex: 1, color: foreground, fontFamily: "DMSans_600SemiBold", fontSize: 15 }}>{live.label}</Text>
      {!terminal && button("Expand", () => setExpanded(true))}
    </View>
    <Text numberOfLines={1} style={{ color: muted, fontSize: 12 }}>{live.browserUrl ? (() => { try { return new URL(live.browserUrl).hostname; } catch { return "Live browser"; } })() : "Live browser"}</Text>
    {!!live.detail && <Text style={{ color: foreground, lineHeight: 21 }}>{live.detail}</Text>}
    {!!live.browserSteps?.length && <View style={{ gap: 6 }}>{live.browserSteps.slice(-3).map((step, i) => <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 9 }}><View style={{ width: step.state === "running" ? 12 : 5, height: step.state === "running" ? 3 : 5, borderRadius: 3, backgroundColor: step.state === "running" ? foreground : border }} /><Text numberOfLines={1} style={{ flex: 1, color: step.state === "running" ? foreground : muted, fontSize: 12 }}>{step.label}</Text></View>)}</View>}
    {!expanded && preview(190)}
    {!expanded && controls}
    {!!error && <Text style={{ color: isDark ? "#f87171" : "#dc2626", fontSize: 13 }}>{error}</Text>}
    <Modal visible={expanded} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => setExpanded(false)}>
      <ScrollView keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12, paddingHorizontal: 16, gap: 14, backgroundColor: background }} style={{ backgroundColor: background }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}><Text style={{ color: foreground, fontSize: 18, fontFamily: "DMSans_600SemiBold" }}>{mateName}’s browser</Text>{button("Done", () => { setExpanded(false); setInput(""); })}</View>
        <View style={{ flex: 1 }}>{preview(canControl ? 330 : 500)}</View>
        {!!error && <Text style={{ color: "#dc2626" }}>{error}</Text>}
        {controls}
      </ScrollView>
    </Modal>
  </View>;
}
