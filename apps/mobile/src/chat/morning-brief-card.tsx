import { useAuth } from "@clerk/expo";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { useTheme } from "../theme/provider";
import { runRequest } from "./background-chat";

type Action = { kind: "calendar"; url: string } | { kind: "email"; threadId: string } | { kind: "run"; runId: string } | { kind: "tasks"; reminderId: string };
type Line = { id: string; section: string; text: string; action: Action };
export type MorningBrief = { id: string; localDay: string; lines: Line[] };

export function parseMorningBrief(value: unknown): MorningBrief | null {
  if (!value || typeof value !== "object") return null;
  const brief = value as Record<string, unknown>;
  if (typeof brief.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(brief.id) || typeof brief.localDay !== "string" || !Array.isArray(brief.lines)) return null;
  const lines = brief.lines.filter((line): line is Line => {
    if (!line || typeof line !== "object") return false;
    const item = line as Record<string, unknown>;
    const action = item.action as Record<string, unknown> | undefined;
    if (typeof item.id !== "string" || typeof item.text !== "string" || typeof item.section !== "string" || !action) return false;
    return action.kind === "calendar" && typeof action.url === "string" && action.url.startsWith("https://")
      || action.kind === "email" && typeof action.threadId === "string" && action.threadId.length > 0
      || action.kind === "run" && typeof action.runId === "string" && action.runId.length > 0
      || action.kind === "tasks" && typeof action.reminderId === "string" && action.reminderId.length > 0;
  }).slice(0, 8);
  return { id: brief.id, localDay: brief.localDay, lines };
}

const viewed = new Set<string>();

/** The saved chat message is the source of truth; chips only navigate. */
export function MorningBriefCard({ brief }: { brief: MorningBrief }) {
  const { getToken, userId } = useAuth();
  const queryClient = useQueryClient();
  const router = useRouter();
  const { colors } = useTheme();
  const [hidden, setHidden] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recordView = () => {
    if (viewed.has(brief.id)) return;
    viewed.add(brief.id);
    void runRequest(getToken, `morning-brief/${brief.id}/view`, {}).catch(() => { viewed.delete(brief.id); });
  };
  const open = async (line: Line) => {
    recordView();
    const action = line.action;
    try {
      if (action.kind === "calendar") await Linking.openURL(action.url);
      else if (action.kind === "email") await Linking.openURL(`https://mail.google.com/mail/#all/${encodeURIComponent(action.threadId)}`);
      else if (action.kind === "run") router.push({ pathname: "/(app)/feed", params: { runId: action.runId } });
      else router.push({ pathname: "/tasks", params: { reminderId: action.reminderId, reminderText: line.text } });
    } catch { setError("Couldn’t open that item. Try again."); }
  };
  const notUseful = async (line: Line) => {
    if (busy || hidden.includes(line.id)) return;
    recordView();
    setBusy(line.id);
    setError(null);
    try {
      await runRequest(getToken, `morning-brief/${brief.id}/not-useful`, { lineId: line.id });
      setHidden((previous) => [...previous, line.id]);
      void queryClient.invalidateQueries({ queryKey: ["morning-brief-settings", userId] });
    } catch { setError("Couldn’t save your feedback. Try again."); }
    finally { setBusy(null); }
  };
  return <View style={{ gap: 10, paddingVertical: 5 }}>
    <Text style={{ color: colors.text, fontFamily: "DMSans_600SemiBold", fontSize: 19 }}>Your morning</Text>
    {brief.lines.map((line) => <View key={line.id} style={{ borderRadius: 14, borderCurve: "continuous", backgroundColor: colors.surface, padding: 12, gap: 8 }}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Open ${line.text}`} onPress={() => void open(line)} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text style={{ color: colors.text, fontFamily: "DMSans_500Medium", fontSize: 15, lineHeight: 21, flex: 1 }}>{line.text}</Text>
        <Text style={{ color: colors.primary, fontSize: 13 }}>Open</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy === line.id || hidden.includes(line.id) }} disabled={busy === line.id || hidden.includes(line.id)} onPress={() => void notUseful(line)}>
        <Text style={{ color: colors.textMuted, fontFamily: "DMSans_400Regular", fontSize: 12 }}>{hidden.includes(line.id) ? "We’ll skip this kind of item" : busy === line.id ? "Saving…" : "Not useful"}</Text>
      </Pressable>
    </View>)}
    {error ? <Text accessibilityRole="alert" style={{ color: colors.error, fontSize: 13 }}>{error}</Text> : null}
  </View>;
}
