import { useAuth } from "@clerk/expo";
import { useAui, useAuiState } from "@assistant-ui/react-native";
import type { WorkflowCard } from "@expojet/api-contract";
import { useState } from "react";
import { ActivityIndicator, Linking, Pressable, Text, View } from "react-native";
import { AppLogo } from "../connections/app-connection";
import { useTheme } from "../theme/provider";
import { ChatIcon } from "./chat-icon";
import { runRequest } from "./background-chat";
import { CardButton } from "./card-button";

type Action = NonNullable<WorkflowCard["plan"]>["actions"][number];

function StatusMark({ action, colors }: { action: Action; colors: ReturnType<typeof useTheme>["colors"] }) {
  if (action.status === "running") return <ActivityIndicator size="small" />;
  if (action.status === "done") return <Text style={{ color: "#30A46C", fontSize: 16, fontWeight: "700" }}>✓</Text>;
  if (action.status === "failed") return <Text style={{ color: colors.error, fontSize: 16, fontWeight: "700" }}>✕</Text>;
  if (action.status === "skipped") return <Text style={{ color: colors.textMuted, fontSize: 13 }}>Skipped</Text>;
  return null;
}

/**
 * One approval for a whole plan. Unticked actions are skipped; the server runs the stored plan,
 * so only the chosen ids travel back, never the actions themselves.
 */
export function PlanCard({ state }: { state: WorkflowCard }) {
  const aui = useAui();
  const running = useAuiState((s) => s.thread.isRunning);
  const { colors, isDark } = useTheme();
  const plan = state.plan;
  const [selected, setSelected] = useState(() => new Set(plan?.actions.map((a) => a.id)));
  const [answered, setAnswered] = useState<"approved" | "declined" | null>(null);
  const { getToken } = useAuth();
  const [undone, setUndone] = useState<Record<string, "busy" | "done" | "failed">>({});
  if (!plan) return null;
  const undo = async (action: Action) => {
    if (!action.undo) return;
    setUndone((current) => ({ ...current, [action.id]: "busy" }));
    try {
      await runRequest(getToken, action.undo.kind === "reminder" ? `reminders/${action.undo.id}/cancel` : `undo/${action.undo.id}`, {});
      setUndone((current) => ({ ...current, [action.id]: "done" }));
    } catch {
      setUndone((current) => ({ ...current, [action.id]: "failed" }));
    }
  };
  const reviewing = state.phase === "waiting" && !answered;

  const answer = (choice: string, outcome: "approved" | "declined") => {
    setAnswered(outcome);
    aui.message.reload({ runConfig: { custom: { resumeRunId: state.resumeRunId, choice } } });
  };
  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <View style={{ padding: 16, borderRadius: 22, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, gap: 14, marginVertical: 4 }}>
      <View style={{ gap: 4 }}>
        <Text style={{ color: colors.textMuted, fontSize: 12, fontFamily: "DMSans_600SemiBold" }}>{state.label}</Text>
        {!!plan.summary && <Text style={{ color: colors.text, fontSize: 16, lineHeight: 22, fontFamily: "DMSans_500Medium" }}>{plan.summary}</Text>}
      </View>
      {plan.actions.map((action) => {
        const on = selected.has(action.id);
        return (
          <Pressable
            key={action.id}
            disabled={!reviewing}
            onPress={() => toggle(action.id)}
            accessibilityRole={reviewing ? "checkbox" : undefined}
            accessibilityState={reviewing ? { checked: on } : undefined}
            accessibilityLabel={action.title}
            style={{ flexDirection: "row", gap: 12, opacity: reviewing && !on ? 0.5 : action.status === "skipped" ? 0.6 : 1 }}
          >
            {reviewing && (
              <View style={{ width: 22, height: 22, marginTop: 2, borderRadius: 7, borderWidth: 1.5, borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primary : "transparent", alignItems: "center", justifyContent: "center" }}>
                {on && <ChatIcon name="check" color={colors.primaryForeground} size={14} />}
              </View>
            )}
            <View style={{ flex: 1, gap: 6 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                {action.kind === "app" && action.app ? <AppLogo name={action.app} logo={action.logo} size={20} /> : <ChatIcon name="tasks" color={colors.textSecondary} size={18} />}
                <Text style={{ color: colors.textMuted, fontSize: 12, flex: 1 }}>{action.app}</Text>
                <StatusMark action={action} colors={colors} />
              </View>
              <Text style={{ color: colors.text, fontSize: 15, lineHeight: 21, fontFamily: "DMSans_600SemiBold", textDecorationLine: undone[action.id] === "done" ? "line-through" : "none" }}>{action.title}</Text>
              {action.details.map((detail) => (
                <Text key={detail.label} selectable style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 20 }}>
                  <Text style={{ color: colors.textMuted }}>{detail.label}: </Text>
                  {detail.value}
                </Text>
              ))}
              {action.error && <Text style={{ color: colors.error, fontSize: 13, lineHeight: 18 }}>{action.error}</Text>}
              {undone[action.id] === "done" ? (
                <Text style={{ color: colors.textMuted, fontSize: 13 }}>Undone</Text>
              ) : action.links?.length || action.undo ? (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4, marginLeft: -8 }}>
                  {action.links?.map((link) => (
                    <CardButton key={link.url} label={link.label} variant="text" onPress={() => void Linking.openURL(link.url)} />
                  ))}
                  {action.undo && action.status === "done" && (
                    <CardButton label={undone[action.id] === "busy" ? "Undoing…" : "Undo"} variant="text" disabled={undone[action.id] === "busy"} onPress={() => void undo(action)} />
                  )}
                </View>
              ) : null}
              {undone[action.id] === "failed" && <Text style={{ color: colors.error, fontSize: 13 }}>Couldn’t undo. Check the app directly.</Text>}
            </View>
          </Pressable>
        );
      })}
      {reviewing ? (
        <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
          <CardButton
            label={selected.size === plan.actions.length ? "Approve" : `Approve ${selected.size}`}
            disabled={running || selected.size === 0}
            onPress={() => answer(`approve:${[...selected].join(",")}`, "approved")}
          />
          <CardButton label="Not now" variant="outlined" disabled={running} onPress={() => answer("decline", "declined")} />
        </View>
      ) : answered && state.phase === "waiting" ? (
        <Text style={{ color: colors.textSecondary }}>{answered === "approved" ? "Approved. Working on it…" : "Declined. Nothing was changed."}</Text>
      ) : null}
    </View>
  );
}
