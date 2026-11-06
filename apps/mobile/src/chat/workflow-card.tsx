import { useAui, useAuiState } from "@assistant-ui/react-native";
import type { WorkflowCard } from "@expojet/api-contract";
import { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { AppLogo, ConnectionButton } from "../connections/app-connection";
import { useTheme } from "../theme/provider";
import { ChatIcon } from "./chat-icon";
import { ActivityLine } from "./activity-line";

/** Apps connected per waiting run; a plan can wait on several before it may resume. */
const connectedByRun = new Map<string, Set<string>>();

export function ToolWorkflowCard({ state }: { state: WorkflowCard }) {
  const { isDark } = useTheme();
  const aui = useAui();
  const running = useAuiState((s) => s.thread.isRunning);
  const messageRunning = useAuiState(
    (s) => s.message.status?.type === "running",
  );
  const hasAction = useAuiState((s) =>
    s.message.content.some(
      (part) =>
        part.type === "tool-call" &&
        ["choice", "connection", "results", "browser"].includes(
          (part.result as WorkflowCard | undefined)?.kind ?? "",
        ),
    ),
  );
  // Every app this run is waiting on, from the sibling connection cards on the same reply.
  const waitingFor = useAuiState((s) =>
    s.message.content
      .flatMap((part) => {
        const card = part.type === "tool-call" ? (part.result as WorkflowCard | undefined) : undefined;
        return card?.kind === "connection" && card.resumeRunId === state.resumeRunId && card.toolkit ? [`${card.toolkit}:${card.name ?? card.toolkit}`] : [];
      })
      .join("|"),
  );
  const [connected, setConnected] = useState(false);
  const [ready, setReady] = useState(false);
  const resuming = useRef(false);
  const stillNeeded = waitingFor
    .split("|")
    .filter(Boolean)
    .map((entry) => entry.split(":"))
    .filter(([slug]) => !connectedByRun.get(state.resumeRunId ?? "")?.has(slug!))
    .map(([, name]) => name!);
  useEffect(() => {
    if (!ready || running || resuming.current || !state.resumeRunId) return;
    resuming.current = true;
    setReady(false);
    aui.message.reload({
      runConfig: { custom: { resumeRunId: state.resumeRunId } },
    });
  }, [ready, running, state.resumeRunId, aui]);
  const foreground = isDark ? "#fafafa" : "#18181b";
  const muted = isDark ? "#a1a1aa" : "#71717a";
  if (state.kind === "connection" && state.toolkit)
    return (
      <View
        style={{
          width: "100%",
          alignSelf: "stretch",
          marginVertical: 12,
          padding: 18,
          borderRadius: 22,
          borderCurve: "continuous",
          backgroundColor: isDark ? "#232326" : "#fafafa",
          borderColor: isDark ? "#353538" : "#e9e9ec",
          borderWidth: 1,
          gap: 14,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <AppLogo name={state.name ?? state.toolkit} logo={state.logo} />
          <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
            <Text
              style={{
                fontFamily: "DMSans_600SemiBold",
                fontSize: 17,
                color: foreground,
              }}
            >
              {state.label}
            </Text>
            <Text
              style={{
                fontFamily: "DMSans_400Regular",
                fontSize: 13,
                color: muted,
              }}
            >
              Connect once. Continue here.
            </Text>
          </View>
        </View>
        <Text
          style={{
            fontFamily: "DMSans_400Regular",
            fontSize: 15,
            lineHeight: 21,
            color: muted,
          }}
        >
          {state.detail}
        </Text>
        <ConnectionButton
          callbackPath="/"
          disabled={ready || running}
          app={{
            slug: state.toolkit,
            name: state.name ?? state.toolkit,
            logo: state.logo,
            connected: false,
            noAuth: false,
            status: "NOT_CONNECTED",
          }}
          onConnected={() => {
            const run = state.resumeRunId ?? "";
            const done = connectedByRun.get(run) ?? new Set<string>();
            done.add(state.toolkit!);
            connectedByRun.set(run, done);
            setConnected(true);
            // Only the card that completes the set resumes, so the run continues exactly once.
            const all = waitingFor.split("|").filter(Boolean).map((entry) => entry.split(":")[0]!);
            if (all.every((slug) => done.has(slug))) {
              resuming.current = false;
              setReady(true);
            }
          }}
        />
        {connected && stillNeeded.length > 0 && (
          <Text style={{ fontFamily: "DMSans_500Medium", fontSize: 13, color: foreground }}>
            Connected. Connect {stillNeeded.join(" and ")} to continue.
          </Text>
        )}
        <Text
          style={{
            fontFamily: "DMSans_400Regular",
            fontSize: 12,
            lineHeight: 17,
            color: muted,
          }}
        >
          Your request is saved. Cooper will pick up where it left off.
        </Text>
      </View>
    );
  if (state.kind === "step" && state.activity?.length)
    return <ActivityLine state={state} messageRunning={messageRunning} isDark={isDark} />;
  if (hasAction || state.phase === "done") return null;
  const interrupted = state.phase === "running" && !messageRunning;
  const failed = interrupted || state.phase === "error";
  const discovery =
    state.stage === "discovery" || state.stage === "preparation";
  const label = failed
    ? interrupted
      ? "Request interrupted"
      : state.label
    : discovery
      ? "Finding the right app…"
      : state.stage === "execution"
        ? state.name
          ? `Using ${state.name}…`
          : "Checking your apps…"
        : "Preparing your answer…";
  return (
    <View
      accessibilityLiveRegion="polite"
      style={{ width: "100%", paddingVertical: 10, gap: 5 }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
        {state.logo && !discovery ? (
          <AppLogo name={state.name ?? "App"} logo={state.logo} size={22} />
        ) : (
          <ChatIcon
            name={failed ? "stop" : discovery ? "search" : "ideas"}
            size={17}
            color={muted}
          />
        )}
        <Text
          style={{
            flex: 1,
            fontFamily: "DMSans_500Medium",
            fontSize: 14,
            lineHeight: 20,
            color: failed ? (isDark ? "#fda4af" : "#be123c") : muted,
          }}
        >
          {label}
        </Text>
      </View>
      {failed && (
        <Text
          style={{
            fontFamily: "DMSans_400Regular",
            fontSize: 13,
            lineHeight: 18,
            color: muted,
          }}
        >
          {state.detail ?? "Try your request again when you’re ready."}
        </Text>
      )}
    </View>
  );
}
