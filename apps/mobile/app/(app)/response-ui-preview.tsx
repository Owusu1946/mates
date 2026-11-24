import type { WorkflowCard } from "@expojet/api-contract";
import type { ReactNode } from "react";
import { ScrollView, Text, View } from "react-native";
import { Redirect } from "expo-router";
import { AppResponseCard } from "../../src/chat/app-results";
import { CodeCard } from "../../src/chat/code-card";
import { ComputerCard } from "../../src/chat/computer-card";
import { ActionApproval } from "../../src/chat/action-approval";
import { ThinkingStatus } from "../../src/chat/thinking-status";
import { RichText } from "../../src/components/rich-text/rich-text";
import { useTheme } from "../../src/theme/provider";
import { useMates } from "../../src/mates/data";
import type { ColorTokens } from "../../src/theme/tokens";

const emailCard: WorkflowCard = {
  kind: "results",
  phase: "done",
  label: "Messages that need you",
  name: "Gmail",
  toolkit: "gmail",
  detail: "Four recent messages need a reply.",
  items: [
    { sourceId: "preview-email-1", title: "Re: Friday’s project review", subtitle: "Ama Mensah <ama@example.com> · 2026-11-24T08:15:00.000Z", preview: "Could you share the updated launch plan before our call?" },
    { sourceId: "preview-email-2", title: "Invoice for November", subtitle: "Kojo at Studio North <kojo@example.com> · 2026-11-23T14:30:00.000Z", preview: "The revised invoice is attached. Let me know if anything needs changing." },
    { sourceId: "preview-email-3", title: "Can we move our meeting?", subtitle: "Esi Owusu <esi@example.com> · 2026-11-22T11:00:00.000Z", preview: "Would 2:30 PM work instead? I can send an updated invite." },
    { sourceId: "preview-email-4", title: "Updated contract draft", subtitle: "Yaw Boateng <yaw@example.com> · 2026-11-21T09:00:00.000Z", preview: "I added the changes we discussed and left one comment for you." },
  ],
};

const calendarCard: WorkflowCard = {
  kind: "results",
  phase: "done",
  label: "Today’s calendar",
  name: "Google Calendar",
  toolkit: "googlecalendar",
  detail: "Your next events, shown in your local time.",
  items: [
    { sourceId: "event-1", title: "Design review", subtitle: "2026-11-24T10:30:00.000Z · 45 min", metrics: ["Kwame", "Meet"] },
    { sourceId: "event-2", title: "Launch check-in", subtitle: "2026-11-24T13:00:00.000Z · 30 min", metrics: ["Ama", "In person"] },
  ],
};

const appCard: WorkflowCard = {
  kind: "results",
  phase: "done",
  label: "Project files",
  name: "Google Drive",
  toolkit: "googledrive",
  items: [
    { sourceId: "drive-1", title: "Launch checklist", subtitle: "Updated · 2026-11-24T08:00:00.000Z", metrics: ["Document"] },
    { sourceId: "drive-2", title: "November budget", subtitle: "Shared by Finance · 2026-11-23T15:20:00.000Z", metrics: ["Spreadsheet"] },
  ],
};

const approvalCard: WorkflowCard = {
  kind: "approval",
  phase: "waiting",
  name: "Gmail",
  label: "Send a reply to Ama",
  approval: { mate: "Kwame", category: "send", targets: ["Ama"], canAlways: false, unattended: false },
  approvalFields: [
    { label: "To", value: "Ama Mensah <ama@example.com>" },
    { label: "Subject", value: "Re: Friday’s project review" },
    { label: "Message", value: "I’ll share the updated launch plan before our call." },
  ],
};

const codeCard: WorkflowCard = {
  kind: "code",
  phase: "done",
  label: "Pull request opened",
  code: {
    runId: "dev-preview",
    repo: "mates/mobile",
    branch: "feat/response-preview",
    status: "done",
    activity: [
      { at: "2026-11-24T08:00:00.000Z", text: "Starting the coder" },
      { at: "2026-11-24T08:01:00.000Z", text: "Updated the response cards" },
      { at: "2026-11-24T08:02:00.000Z", text: "pnpm typecheck passed" },
      { at: "2026-11-24T08:03:00.000Z", text: "Opened pull request #248" },
    ],
    checks: [{ name: "Typecheck", command: "pnpm typecheck", passed: true, output: "" }],
    pr: { number: 248, url: "https://github.com/example/mates/pull/248", title: "Tidy up chat response cards", additions: 84, deletions: 19, files: 4 },
  },
};

const computerCards: WorkflowCard[] = [
  {
    kind: "computer", phase: "done", label: "Completed", detail: "Finished and saved.",
    computer: { goalId: "preview-done", goal: "Prepare a short launch update", status: "done", steps: [], summary: "Drafted the update and saved it for your review." },
  },
  {
    kind: "computer", phase: "error", label: "Couldn’t finish", detail: "The site timed out before the export completed.",
    computer: { goalId: "preview-failed", goal: "Export the latest report", status: "failed", steps: [], error: "The site timed out before the export completed." },
  },
  {
    kind: "computer", phase: "done", label: "Stopped", detail: "Earlier changes remain.",
    computer: { goalId: "preview-stopped", goal: "Update the project dashboard", status: "cancelled", steps: [], summary: "Updated the title and saved the first section." },
  },
];

export default function ResponseUiPreviewScreen() {
  const { colors, isDark } = useTheme();
  const ownedMates = useMates().data?.mates ?? [];
  const previewMate = ownedMates.find((mate) => mate.isDefault) ?? ownedMates[0];
  const richColors = { text: colors.text, muted: colors.textSecondary, surface: colors.surfaceElevated, border: colors.border, codeSurface: isDark ? "#303036" : "#f1f5f9" };

  if (!__DEV__) return <Redirect href="/(app)" />;

  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48, gap: 24 }}>
      <Text style={{ color: colors.textSecondary, fontFamily: "DMSans_400Regular", fontSize: 13, lineHeight: 19 }}>
        Sample content only. These cards don’t start tasks or change your data.
      </Text>

      <Section title="Thinking" colors={colors}>
        <ThinkingStatus mateName={previewMate?.name ?? "Kwame"} gradient={previewMate?.gradient ?? ["#b9c8f5", "#5b7be0", "#26408b"]} shape={previewMate?.shape ?? "circle"} mutedColor={colors.textSecondary} />
      </Section>

      <Section title="Approval in the conversation" colors={colors}>
        <ActionApproval state={approvalCard} preview />
      </Section>

      <Section title="Email results" colors={colors}>
        <AppResponseCard state={emailCard} />
      </Section>

      <Section title="Calendar results" colors={colors}>
        <AppResponseCard state={{ ...calendarCard, items: calendarCard.items?.map((item) => item.sourceId === "event-1" ? { ...item, metrics: [previewMate?.name ?? "Kwame", "Meet"] } : item) }} />
      </Section>

      <Section title="Other app results" colors={colors}>
        <AppResponseCard state={appCard} />
      </Section>

      <Section title="Code and pull request" colors={colors}>
        <CodeCard state={codeCard} preview />
      </Section>

      <Section title="Computer task outcomes" colors={colors}>
        {computerCards.map((card) => <ComputerCard key={card.computer?.goalId} state={card} preview />)}
      </Section>

      <Section title="Formatted answer" colors={colors}>
        <RichText colors={richColors}>{`## A clear answer\n\nHere’s the **short version** with the useful detail first.\n\n- One action you can take\n- Another detail worth keeping\n\n\`\`\`ts\nconst ready = true;\n\`\`\`\n\n> The answer stays readable when it gets longer.`}</RichText>
      </Section>
    </ScrollView>
  );
}

function Section({ title, colors, children }: { title: string; colors: ColorTokens; children: ReactNode }) {
  return (
    <View style={{ gap: 10 }}>
      <Text style={{ color: colors.textMuted, fontFamily: "DMSans_600SemiBold", fontSize: 11, letterSpacing: 0.8, textTransform: "uppercase" }}>{title}</Text>
      <View style={{ paddingHorizontal: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 16, backgroundColor: colors.card }}>
        {children}
      </View>
    </View>
  );
}
