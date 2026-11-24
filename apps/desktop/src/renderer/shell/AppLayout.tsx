import { useRef, useState } from "react";
import { replyStatus } from "../chat/chatFlow.logic.ts";
import { ChatView } from "../chat/ChatView.tsx";
import { MateAvatar } from "../chat/MateAvatar.tsx";
import { useChatFlow } from "../chat/useChatFlow.ts";
import { RepoPage } from "../code/RepoPage.tsx";
import { runStatus } from "../code/runPlayer.logic.ts";
import { RunStatusDot } from "../code/RunStatusDot.tsx";
import { RunView, type CodePanels } from "../code/RunView.tsx";
import { useRunPlayer } from "../code/useRunPlayer.ts";
import { Icon } from "../components/ui/Icon.tsx";
import { MOD } from "../components/ui/Kbd.tsx";
import { TooltipProvider } from "../components/ui/Tooltip.tsx";
import { PLACES, REPOS, type Crew, type Mate } from "../data/sampleCrew.ts";
import { MATE_ID, newRun, RUNS, type Run } from "../data/sampleRuns.ts";
import { PlaceholderPage } from "../places/PlaceholderPage.tsx";
import { SettingsPage, type ChatActivityMode } from "../places/SettingsPage.tsx";
import { Sidebar } from "../sidebar/Sidebar.tsx";
import { jumpTargets, type Selection } from "../sidebar/Sidebar.logic.ts";
import { THEMES } from "../theme/appearance.logic.ts";
import { setAppearance } from "../theme/appearance.ts";
import { CommandPalette, type PaletteItem } from "./CommandPalette.tsx";
import { FOCUS_ORDER, nextFocusArea, type FocusArea } from "./focusAreas.logic.ts";
import { TitleBar } from "./TitleBar.tsx";
import { useGlobalShortcuts } from "./useGlobalShortcuts.ts";

const PLACE_PAGES = {
  activity: { icon: "activity", title: "What mates did", body: "Everything your mates did for you, newest first, with what it cost and where it's saved." },
  routines: { icon: "clock", title: "Routines", body: "Things your mates do on a schedule, like the morning brief and the Friday money check." },
  friends: { icon: "users", title: "Friends", body: "Friends whose mates can talk to yours, and what each one is allowed to ask." },
} as const;

/** Moves focus into an area: the selected sidebar row, or the area itself. */
function focusArea(area: FocusArea) {
  const element = document.querySelector<HTMLElement>(`[data-focus-area="${area}"]`);
  const target = area === "sidebar" ? (element?.querySelector<HTMLElement>('[aria-current="page"]') ?? element?.querySelector<HTMLElement>("button")) : element;
  target?.focus();
}

/** The crew window: title bar, sidebar and whatever's selected (T3 Code's AppSidebarLayout). */
export function AppLayout({ crew, onSignOut }: { crew: Crew; onSignOut: () => void }) {
  const [flow, dispatch] = useChatFlow(crew);
  const [selection, setSelection] = useState<Selection>({ kind: "chat", id: "chat-lead" });
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [activityMode, setActivityMode] = useState<ChatActivityMode>(() => {
    try {
      return localStorage.getItem("mates.chat-activity") === "detailed" ? "detailed" : "quiet";
    } catch {
      return "quiet";
    }
  });
  const changeActivityMode = (next: ChatActivityMode) => {
    setActivityMode(next);
    try {
      localStorage.setItem("mates.chat-activity", next);
    } catch {
      // The selected mode still applies for this session.
    }
  };
  const composerRef = useRef<HTMLTextAreaElement>(null);
  // The Code view: every run's playback, drafts per run or repo, and the panels you keep open.
  const [runs, setRuns] = useState<Run[]>(RUNS);
  const [runStates, runDispatch] = useRunPlayer(RUNS);
  const [codeDrafts, setCodeDrafts] = useState<Record<string, string>>({});
  const [panels, setPanels] = useState<CodePanels>({ diff: false, terminal: false, diffStyle: "unified", wrap: false, focusPath: null });
  const changePanels = (change: Partial<CodePanels>) => setPanels({ ...panels, ...change });

  // A mate answering shows it everywhere: its sidebar face, the header.
  const liveMates: Record<string, Mate> = Object.fromEntries(
    crew.mates.map((mate) => {
      const status = replyStatus(flow.replies, mate.id);
      return [mate.id, status ? { ...mate, status } : mate];
    }),
  );
  // The timeline uses the crew as it is, so a streaming reply doesn't re-render every row.
  const crewMates: Record<string, Mate> = Object.fromEntries(crew.mates.map((mate) => [mate.id, mate]));
  const targets = jumpTargets(
    crew.chats.filter((chat) => chat.kind === "mate").map((chat) => chat.id),
    crew.chats.filter((chat) => chat.kind === "group").map((chat) => chat.id),
  );
  const chat = selection.kind === "chat" ? crew.chats.find((candidate) => candidate.id === selection.id) : undefined;
  const run = selection.kind === "run" ? runs.find((candidate) => candidate.id === selection.id) : undefined;
  const coder = crewMates[MATE_ID]!;
  const runRows = runs.flatMap((candidate) => (runStates[candidate.id] ? [{ run: candidate, status: runStatus(runStates[candidate.id]!) }] : []));

  const select = (next: Selection) => {
    setSelection(next);
    if (next.kind === "chat") dispatch({ type: "open", chatId: next.id });
    // A run plays the first time you open it.
    if (next.kind === "run") runDispatch({ type: "start", runId: next.id, at: Date.now() });
  };

  const startRun = (repoId: string, where: Run["where"]) => {
    const repo = REPOS.find((candidate) => candidate.id === repoId)!;
    const text = codeDrafts[`repo:${repoId}`] ?? "";
    if (!text.trim()) return;
    const created = newRun(repo, where, text, runs.length);
    setRuns([created, ...runs]);
    runDispatch({ type: "create", run: created });
    setCodeDrafts({ ...codeDrafts, [`repo:${repoId}`]: "" });
    select({ kind: "run", id: created.id });
  };

  const newChat = () => {
    select({ kind: "chat", id: "chat-lead" });
    // The chat view mounts on this render; focus once it's there.
    requestAnimationFrame(() => composerRef.current?.focus());
  };

  // Everything Ctrl/⌘ K can reach: where to go, the runs, and what to do.
  const paletteItems: PaletteItem[] = [
    ...crew.chats.map((candidate): PaletteItem => {
      const lead = liveMates[candidate.leadId]!;
      return {
        id: `chat:${candidate.id}`,
        group: "Go to",
        label: candidate.title,
        hint: candidate.kind === "group" ? "Group" : lead.role,
        keywords: candidate.kind === "group" ? candidate.mateIds.map((id) => crewMates[id]!.name) : [lead.role],
        leading: candidate.kind === "mate" ? <MateAvatar mate={lead} size={18} /> : <Icon name="hash" />,
        run: () => select({ kind: "chat", id: candidate.id }),
      };
    }),
    ...PLACES.map((placeItem): PaletteItem => ({ id: `place:${placeItem.id}`, group: "Go to", label: placeItem.label, leading: <Icon name={placeItem.icon} />, run: () => select({ kind: "place", id: placeItem.id }) })),
    ...REPOS.map((repoItem): PaletteItem => ({ id: `repo:${repoItem.id}`, group: "Go to", label: repoItem.name, hint: repoItem.where, keywords: ["code", "repo"], leading: <Icon name="branch" />, run: () => select({ kind: "repo", id: repoItem.id }) })),
    { id: "place:settings", group: "Go to", label: "Settings", hint: `${MOD} ,`, keywords: ["preferences", "appearance"], leading: <Icon name="settings" />, run: () => select({ kind: "place", id: "settings" }) },
    ...runRows.map(({ run: runItem, status }): PaletteItem => ({
      id: `run:${runItem.id}`,
      group: "Runs",
      label: runItem.title,
      hint: REPOS.find((candidate) => candidate.id === runItem.repoId)?.name,
      keywords: [runItem.branch, status === "waiting" ? "needs you" : status],
      leading: <RunStatusDot status={status} />,
      run: () => select({ kind: "run", id: runItem.id }),
    })),
    { id: "new-chat", group: "Actions", label: "New chat", hint: `${MOD} N`, keywords: ["message", "ask"], leading: <Icon name="edit" />, run: newChat },
    ...(run
      ? [
          { id: "toggle-diff", group: "Actions", label: panels.diff ? "Hide the Diff panel" : "Show the Diff panel", hint: `${MOD} D`, keywords: ["changes"], leading: <Icon name="columns" />, run: () => changePanels({ diff: !panels.diff }) } satisfies PaletteItem,
          ...(run.terminals.length
            ? [{ id: "toggle-terminal", group: "Actions", label: panels.terminal ? "Hide the terminal" : "Show the terminal", hint: `${MOD} J`, keywords: ["shell", "output"], leading: <Icon name="terminal" />, run: () => changePanels({ terminal: !panels.terminal }) } satisfies PaletteItem]
            : []),
        ]
      : []),
    { id: "scheme:system", group: "Actions", label: "Match the system", keywords: ["appearance", "theme", "auto"], leading: <Icon name="monitor" />, run: () => setAppearance({ scheme: "system" }) },
    { id: "scheme:light", group: "Actions", label: "Light mode", keywords: ["appearance", "theme"], leading: <Icon name="sun" />, run: () => setAppearance({ scheme: "light" }) },
    { id: "scheme:dark", group: "Actions", label: "Dark mode", keywords: ["appearance", "theme", "night"], leading: <Icon name="moon" />, run: () => setAppearance({ scheme: "dark" }) },
    ...THEMES.map((theme): PaletteItem => ({ id: `theme:${theme.name}`, group: "Actions", label: `${theme.label} theme`, keywords: ["appearance", "colours", "colors"], leading: <Icon name="sun" />, run: () => setAppearance({ theme: theme.name }) })),
    { id: "sign-out", group: "Actions", label: "Sign out", keywords: ["log out"], leading: <Icon name="logout" />, run: onSignOut },
  ];

  const { showJumpHints } = useGlobalShortcuts({
    onJump: (index) => {
      const target = targets[index];
      if (target) select(target);
    },
    onSearch: () => setPaletteOpen(!paletteOpen),
    onNewChat: newChat,
    onSettings: () => select({ kind: "place", id: "settings" }),
    onCycleFocus: (backwards) => {
      const current = document.activeElement?.closest<HTMLElement>("[data-focus-area]")?.dataset.focusArea as FocusArea | undefined;
      // Only the areas on screen take part: a run adds its open terminal and panel.
      const shown = FOCUS_ORDER.filter((area) => document.querySelector(`[data-focus-area="${area}"]`));
      const next = nextFocusArea(current ?? null, shown, backwards);
      if (next) focusArea(next);
    },
    onToggleDiff: () => {
      if (run) changePanels({ diff: !panels.diff });
    },
    onToggleTerminal: () => {
      if (run) changePanels({ terminal: !panels.terminal });
    },
  });

  const repo = selection.kind === "repo" ? REPOS.find((candidate) => candidate.id === selection.id) : undefined;
  const place = selection.kind === "place" && selection.id in PLACE_PAGES ? PLACE_PAGES[selection.id as keyof typeof PLACE_PAGES] : undefined;

  return (
    <TooltipProvider>
      <TitleBar onSearch={() => setPaletteOpen(true)} />
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} items={paletteItems} />
      <div className="flex min-h-0 flex-1">
        <Sidebar
          you={crew.you}
          chats={crew.chats}
          mates={liveMates}
          unread={flow.unread}
          runs={runRows}
          selection={selection}
          jumpTargets={targets}
          showJumpHints={showJumpHints}
          onSelect={select}
          onNewChat={newChat}
          onSignOut={onSignOut}
        />
        <main className="min-w-0 flex-1">
          {chat && <ChatView key={chat.id} chat={chat} mates={liveMates} timelineMates={crewMates} flow={flow} dispatch={dispatch} composerRef={composerRef} quiet={activityMode === "quiet"} />}
          {place && <PlaceholderPage key={selection.id} {...place} />}
          {selection.kind === "place" && selection.id === "settings" && <SettingsPage activityMode={activityMode} onActivityMode={changeActivityMode} />}
          {repo && (
            <RepoPage
              key={repo.id}
              repo={repo}
              runs={runRows.filter((row) => row.run.repoId === repo.id)}
              mateName={coder.name}
              draft={codeDrafts[`repo:${repo.id}`] ?? ""}
              onDraft={(text) => setCodeDrafts({ ...codeDrafts, [`repo:${repo.id}`]: text })}
              onStart={(where) => startRun(repo.id, where)}
              onOpenRun={(id) => select({ kind: "run", id })}
              composerRef={composerRef}
            />
          )}
          {run && runStates[run.id] && (
            <RunView
              key={run.id}
              run={run}
              repoName={REPOS.find((candidate) => candidate.id === run.repoId)?.name ?? run.repoId}
              state={runStates[run.id]!}
              mate={coder}
              dispatch={runDispatch}
              panels={panels}
              onPanels={changePanels}
              draft={codeDrafts[run.id] ?? ""}
              onDraft={(text) => setCodeDrafts({ ...codeDrafts, [run.id]: text })}
              composerRef={composerRef}
            />
          )}
        </main>
      </div>
    </TooltipProvider>
  );
}
