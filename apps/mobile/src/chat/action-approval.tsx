import { useAui, useAuiState } from "@assistant-ui/react-native";
import type { WorkflowCard } from "@expojet/api-contract";
import { Text, View } from "react-native";
import { useTheme } from "../theme/provider";
import { useState } from "react";
import { CardButton } from "./card-button";

export function ActionApproval({ state }: { state: WorkflowCard }) {
  const aui = useAui();
  const running = useAuiState(s => s.thread.isRunning);
  const { colors, isDark } = useTheme();
  const [choice, setChoice] = useState<string | null>(null);
  const answer = (value: string) => {
    setChoice(value);
    aui.message.reload({ runConfig: { custom: { resumeRunId: state.resumeRunId, choice: value } } });
  };
  return <View style={{ padding: 18, borderRadius: 20, borderWidth: 1, borderColor: colors.border, gap: 12 }}>
    <Text style={{ color: colors.text, fontWeight: "600", fontSize: 18 }}>{state.label}{state.name ? ` · ${state.name}` : ""}</Text>
    <Text style={{ color: colors.textSecondary }}>{state.detail}</Text>
    {state.approvalFields?.map(field => <View key={field.label} style={{ gap: 5 }}><Text style={{ color: colors.textMuted, fontSize: 12 }}>{field.label}</Text><Text selectable style={{ color: colors.text, lineHeight: 21 }}>{field.value}</Text></View>)}
    {choice ? <Text style={{ color: colors.textSecondary }}>{choice === "approve" ? "Approval submitted" : "Declined"}</Text> : <View style={{ flexDirection: "row", gap: 12 }}><CardButton label="Approve action" disabled={running} onPress={() => answer("approve")} /><CardButton label="Decline" variant="outlined" disabled={running} onPress={() => answer("decline")} /></View>}
  </View>;
}
