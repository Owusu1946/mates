import { useEffect, useRef, useState } from "react";
import type { ChatActivityMode } from "../chat/activityModes.ts";
import type { ChatAction } from "../chat/chatFlow.logic.ts";
import { ChatView } from "../chat/ChatView.tsx";
import { MateAvatar } from "../chat/MateAvatar.tsx";
import { OpenRunContext } from "../chat/openRun.ts";
import { OpenPageContext } from "../chat/openPage.ts";
import { OpenChatContext } from "../chat/openChat.ts";
import { PagePanel } from "../chat/PagePanel.tsx";
import { formatCallTime } from "../call/call.logic.ts";
import { CallPanel } from "../call/CallPanel.tsx";
import { useCall } from "../call/useCall.ts";
import type { SidePanel } from "../chat/ChatHeader.tsx";
import { useChatFlowFrom } from "../chat/useChatFlow.ts";
import { initialFlow } from "../chat/chatFlow.logic.ts";
import { liveGoal } from "../computer/computer.logic.ts";
import { ComputerPanel } from "../computer/ComputerPanel.tsx";
import { useComputer } from "../computer/useComputers.ts";
import { useMateMoods } from "../chat/useMateMoods.ts";
import type { Reply } from "../chat/chatFlow.logic.ts";
import { useLiveChats } from "../remote/liveRuns.ts";
import { RepoPage } from "../code/RepoPage.tsx";
import { runStatus } from "../code/runPlayer.logic.ts";
import { RunStatusDot } from "../code/RunStatusDot.tsx";
import { RunView, type CodePanels } from "../code/RunView.tsx";
import { useRunPlayer } from "../code/useRunPlayer.ts";
import { Icon } from "../components/ui/Icon.tsx";
import { MOD } from "../components/ui/Kbd.tsx";
import { TooltipProvider } from "../components/ui/Tooltip.tsx";
import { REPOS, type Chat, type Mate, type SampleProfile } from "../data/sampleCrew.ts";
import type { Crew, CrewChat } from "../data/toDesktop.logic.ts";
import { useCrewActions } from "../remote/crew.ts";
import { newRun, RUNS, type Run } from "../data/sampleRuns.ts";
import { ACTIVITY, FRIEND_REQUESTS, FRIENDS } from "../data/samplePlaces.ts";
import { ActivityPage } from "../places/ActivityPage.tsx";
import { FriendsPage } from "../places/FriendsPage.tsx";
import { NewGroupDialog, type NewGroup } from "../places/NewGroupDialog.tsx";
import { NewMateDialog, type NewMate } from "../places/NewMateDialog.tsx";
import { RoutinesPage } from "../places/RoutinesPage.tsx";
import { SettingsDialog } from "../places/SettingsDialog.tsx";
import { Sidebar } from "../sidebar/Sidebar.tsx";
import { jumpTargets, type Selection } from "../sidebar/Sidebar.logic.ts";
import { PinGlyph } from "../sidebar/PinMenu.tsx";
import { togglePinned, usePins } from "../sidebar/pins.ts";
import { useStableCallback } from "../hooks/useStableCallback.ts";
import { showsCoding } from "../settings/coding.logic.ts";
import { markCodingEngaged, useCoding } from "../settings/coding.ts";
import { THEMES } from "../theme/appearance.logic.ts";
import { setAppearance } from "../theme/appearance.ts";
import { CommandPalette, type PaletteItem } from "./CommandPalette.tsx";
import { FOCUS_ORDER, nextFocusArea, type FocusArea } from "./focusAreas.logic.ts";
import { TitleBar } from "./TitleBar.tsx";
import { useGlobalShortcuts } from "./useGlobalShortcuts.ts";

/** Moves focus into an area: the selected sidebar row, or the area itself. */
function focusArea(area: FocusArea) {
  const element = document.querySelector<HTMLElement>(`[data-focus-area="${area}"]`);
  const target = area === "sidebar" ? (element?.querySelector<HTMLElement>('[aria-current="page"]') ?? element?.querySelector<HTMLElement>("button")) : element;
  target?.focus();
}

type AppLayoutProps = {
  you: string;
  email: string | undefined;
  /** Your crew from the API (remote/crew.ts). */
  crew: Crew;
  unread: Record<string, boolean>;
  /** You looked at a chat: it stops counting as unread on this device. */
  onSeen: (chatId: string) => void;
  /** What you told your lead mate at sign-up, until Memory reads the API. */
  profile?: SampleProfile;
  hasProjects?: boolean;
  onSignOut: () => void;
};

/** The crew window: title bar, sidebar and whatever's selected (T3 Code's AppSidebarLayout). */
export function AppLayout({ you, email, crew, unread, onSeen, profile, hasProjects, onSignOut }: AppLayoutProps) {
  // Conversations are still the sample's until they read the API (the next change).
  const [flow, dispatch] = useChatFlowFrom(() => initialFlow({}, {}));
  const leadChatId = crew.chats.find((candidate) => candidate.kind === "mate" && candidate.leadId === crew.leadId)?.id ?? crew.chats[0]?.id ?? "";
  const [selection, setSelection] = useState<Selection>({ kind: "chat", id: leadChatId });
  const actions = useCrewActions();
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const [creating, setCreating] = useState<"mate" | "group" | null>(null);
  // Call and Computer: one call for the whole app, so switching chats doesn't drop it, and your
  // one computer, shared by your mates. The panel beside the chat shows one or the other.
  const [call, callDispatch] = useCall();
  const [computer, computerDispatch] = useComputer();
  const [side, setSide] = useState<SidePanel>(null);
  const computerGoal = computer.power === "on" ? liveGoal(computer) : null;
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState("activity");
  const openSettings = (section = "account") => {
    setPaletteOpen(false);
    setSettingsSection(section);
    setSettingsOpen(true);
  };
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

  const [editing, setEditing] = useState<string | null>(null);
  const allMates = crew.mates;
  // Mates and groups first, newest first; then the older chats the sidebar folds away.
  const chats: CrewChat[] = [...crew.chats, ...crew.earlier];
  // A mate's mood shows everywhere, its sidebar face and the header: listening while you type to
  // it, thinking, working, happy when it's done (chat/mateMood.logic.ts).
  // Replies in progress in any chat (remote/liveRuns.ts): each one's mate thinks, works on its step, or waits on you.
  const live = useLiveChats();
  const leadOf = (chatId: string) => chats.find((candidate) => candidate.id === chatId)?.leadId;
  const replies: Record<string, Reply> = Object.fromEntries(
    Object.entries(live).flatMap(([chatId, state]) => {
      const mateId = leadOf(chatId);
      return mateId && state.phase !== "waiting" ? [[chatId, { chatId, mateId, phase: state.phase === "thinking" ? "thinking" : "streaming", full: "", shown: 0 } satisfies Reply]] : [];
    }),
  );
  const steps = Object.fromEntries(Object.entries(live).flatMap(([chatId, state]) => (leadOf(chatId) ? [[leadOf(chatId)!, state]] : [])));
  const moods = useMateMoods(replies);
  const liveMates: Record<string, Mate> = Object.fromEntries(
    allMates.map((mate) => {
      const status = moods.moodOf(mate.id);
      const now = steps[mate.id];
      if (now?.phase === "waiting") return [mate.id, { ...mate, status: "waiting", step: now.step ?? "Waiting on you" }];
      if (status) return [mate.id, { ...mate, status, ...(now?.step ? { step: now.step } : {}) }];
      // The mate using the computer shows it: working on its current step, or needing you.
      if (computerGoal?.mateId === mate.id) {
        const step = computerGoal.steps[computerGoal.shown - 1]?.label;
        return [mate.id, { ...mate, status: computerGoal.status === "waiting" && computerGoal.waitingFor !== "user_control" ? "waiting" : "working", step: step ?? "Using your computer" }];
      }
      return [mate.id, mate];
    }),
  );
  // The timeline uses the crew as it is, so a streaming reply doesn't re-render every row.
  const crewMates: Record<string, Mate> = Object.fromEntries(allMates.map((mate) => [mate.id, mate]));
  const { pins } = usePins();
  const targets = jumpTargets(
    chats.filter((chat) => chat.kind === "mate").map((chat) => chat.id),
    chats.filter((chat) => chat.kind === "group").map((chat) => chat.id),
    pins.filter((id) => chats.some((chat) => chat.id === id)),
  );
  // Typing to a mate makes it listen; groups listen through their lead.
  const chatDispatch = (action: ChatAction) => {
    if (action.type === "draft") moods.noteTyping(action.text.trim() ? (chats.find((candidate) => candidate.id === action.chatId)?.leadId ?? null) : null);
    if (action.type === "send") moods.noteTyping(null);
    dispatch(action);
  };
  const chat = selection.kind === "chat" ? chats.find((candidate) => candidate.id === selection.id) : undefined;
  // The chat on screen stays read as messages arrive, but only while you're in this window: a
  // reply that lands while you're in another app is still new when you come back.
  const seeOpenChat = useStableCallback(() => {
    if (chat && document.hasFocus()) onSeen(chat.id);
  });
  useEffect(() => {
    seeOpenChat();
    window.addEventListener("focus", seeOpenChat);
    return () => window.removeEventListener("focus", seeOpenChat);
  }, [chat?.id, chat?.at, seeOpenChat]);
  const run = selection.kind === "run" ? runs.find((candidate) => candidate.id === selection.id) : undefined;
  // The code runs are still the sample's; your lead mate stands in for their coder.
  const coder = (crew.leadId && crewMates[crew.leadId]) || allMates[0]!;
  // Coding is a side of Mates, not the centre: its tools show only for people who code.
  const coding = useCoding();
  const codingOn = showsCoding(coding.preference, { engaged: coding.engaged, hasProjects: hasProjects !== false });
  const runRows = runs.flatMap((candidate) => (runStates[candidate.id] ? [{ run: candidate, status: runStatus(runStates[candidate.id]!) }] : []));

  const select = (next: Selection) => {
    setSelection(next);
    if (next.kind === "chat") {
      dispatch({ type: "open", chatId: next.id });
      onSeen(next.id);
    }
    // A run plays the first time you open it.
    if (next.kind === "run") runDispatch({ type: "start", runId: next.id, at: Date.now() });
  };

  // Seeing a mate's code work counts as starting to code: in Automatic, Projects appears from here.
  const openRun = (runId: string) => {
    markCodingEngaged();
    select({ kind: "run", id: runId });
  };

  const askToBuild = () => {
    select({ kind: "chat", id: leadChatId });
    requestAnimationFrame(() => composerRef.current?.focus());
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

  const inCall = call !== null && call.phase !== "ended";
  const openSide = (next: SidePanel, from: Chat) => {
    // Calling starts one with everyone in the chat, unless a call is already on.
    if (next === "call" && !inCall) callDispatch({ type: "start", chatId: from.id, memberIds: from.mateIds, at: Date.now() });
    if (side === "page" && next !== "page") closePage();
    setSide(next);
  };
  // A web page beside the chat (a citation, a source), in the same panel as Call and Computer.
  const [page, setPage] = useState<string | null>(null);
  const openPage = (url: string) => {
    setPage(url);
    setSide("page");
    window.mates.pages.open(url);
  };
  const closePage = () => {
    window.mates.pages.close();
    setPage(null);
  };
  // Hanging up leaves the summary in the chat the call started from.
  const endCall = () => {
    if (!call || call.phase === "ended") return;
    const at = Date.now();
    const lead = call.memberIds[0]!;
    const duration = call.phase === "live" ? formatCallTime(at - call.startedAt) : "0:00";
    callDispatch({ type: "end", at });
    dispatch({ type: "append", chatId: call.chatId, messages: [{ id: `call-${at}`, author: lead, text: `Call · ${duration}. I'll take care of what we talked about and keep you posted here.` }] });
  };
  const closeSide = () => {
    if (call?.phase === "ended") callDispatch({ type: "close" });
    if (side === "page") closePage();
    setSide(null);
  };

  /** Opens a chat and puts the cursor in its composer, once the chat view has mounted. */
  const openChat = (chatId: string) => {
    select({ kind: "chat", id: chatId });
    requestAnimationFrame(() => composerRef.current?.focus());
  };

  // A new mate joins your crew on every device, with its own chat, where it says hello (the API's greeting).
  const createMate = async (input: NewMate) => {
    const result = await actions.createMate(input);
    if (result.error !== null) return result.error;
    setCreating(null);
    openChat(result.value);
    return null;
  };

  // A new group: the first mate chosen leads it.
  const createGroup = async ({ title, mateIds }: NewGroup) => {
    const result = await actions.createGroup({ title, mateIds });
    if (result.error !== null) return result.error;
    setCreating(null);
    openChat(result.value);
    return null;
  };

  // A conversation carried over from the summon bar opens in its mate's chat, as if it had been here.
  const receiveHandoff = useStableCallback((handoff: { mateId: string; question: string; answer: string }) => {
    const target = crew.chats.find((candidate) => candidate.kind === "mate" && candidate.leadId === handoff.mateId);
    if (!target) return;
    const at = Date.now();
    dispatch({
      type: "append",
      chatId: target.id,
      messages: [{ id: `summon-q-${at}`, author: "me", text: handoff.question }, ...(handoff.answer ? [{ id: `summon-a-${at}`, author: handoff.mateId, text: handoff.answer }] : [])],
    });
    select({ kind: "chat", id: target.id });
  });
  useEffect(() => {
    const take = () => void window.mates.takeHandoff().then((handoff) => handoff && receiveHandoff(handoff));
    // One may be waiting from before this window opened, and more can arrive while it's open.
    take();
    return window.mates.onHandoff(take);
  }, [receiveHandoff]);

  // Everything Ctrl/⌘ K can reach: where to go, the runs, and what to do.
  const paletteItems: PaletteItem[] = [
    ...chats.map((candidate): PaletteItem => {
      const lead = liveMates[candidate.leadId]!;
      return {
        id: `chat:${candidate.id}`,
        group: "Go to",
        label: candidate.title,
        hint: candidate.kind === "group" ? "Group" : candidate.kind === "thread" ? lead.name : lead.role,
        keywords: [lead.role, ...candidate.mateIds.map((id) => crewMates[id]!.name)],
        leading: candidate.kind === "group" ? <Icon name="hash" /> : <MateAvatar mate={lead} size={18} />,
        run: () => select({ kind: "chat", id: candidate.id }),
      };
    }),
    ...(codingOn ? REPOS : []).map((repoItem): PaletteItem => ({ id: `repo:${repoItem.id}`, group: "Go to", label: repoItem.name, hint: repoItem.where, keywords: ["code", "repo"], leading: <Icon name="branch" />, run: () => select({ kind: "repo", id: repoItem.id }) })),
    { id: "place:activity", group: "Go to", label: "What mates did", keywords: ["activity", "feed", "results", "history"], leading: <Icon name="activity" />, run: () => select({ kind: "place", id: "activity" }) },
    { id: "place:routines", group: "Go to", label: "Routines", keywords: ["schedule", "every", "daily", "brief"], leading: <Icon name="clock" />, run: () => select({ kind: "place", id: "routines" }) },
    { id: "place:friends", group: "Go to", label: "Friends", keywords: ["people", "invite", "share"], leading: <Icon name="users" />, run: () => select({ kind: "place", id: "friends" }) },
    { id: "settings", group: "Go to", label: "Settings", hint: `${MOD} ,`, keywords: ["preferences", "appearance", "chat activity"], leading: <Icon name="settings" />, run: () => openSettings() },
    { id: "usage", group: "Go to", label: "Usage", keywords: ["plan", "limit", "billing", "subscription"], leading: <Icon name="clock" />, run: () => openSettings("usage") },
    { id: "memory", group: "Go to", label: "Memory", keywords: ["remember", "forget", "memories", "export"], leading: <Icon name="brain" />, run: () => openSettings("memory") },
    ...(codingOn ? runRows : []).map(({ run: runItem, status }): PaletteItem => ({
      id: `run:${runItem.id}`,
      group: "Runs",
      label: runItem.title,
      hint: REPOS.find((candidate) => candidate.id === runItem.repoId)?.name,
      keywords: [runItem.branch, status === "waiting" ? "needs you" : status],
      leading: <RunStatusDot status={status} />,
      run: () => select({ kind: "run", id: runItem.id }),
    })),
    { id: "new-mate", group: "Actions", label: "New mate", hint: `${MOD} N`, keywords: ["create", "add", "assistant"], leading: <Icon name="plus" />, run: () => setCreating("mate") },
    { id: "new-group", group: "Actions", label: "New group", keywords: ["create", "team", "together"], leading: <Icon name="users" />, run: () => setCreating("group") },
    ...(chat
      ? [{ id: "pin-chat", group: "Actions", label: pins.includes(chat.id) ? `Unpin ${chat.title}` : `Pin ${chat.title} to the top`, keywords: ["pin", "favourite", "shelf"], leading: <PinGlyph />, run: () => togglePinned(chat.id) } satisfies PaletteItem]
      : []),
    { id: "ask-to-build", group: "Actions", label: `Ask ${coder.name} to build something`, keywords: ["code", "website", "app", "fix", "build"], leading: <MateAvatar mate={coder} size={18} />, run: askToBuild },
    ...(run && codingOn
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
    ...THEMES.map((theme): PaletteItem => ({ id: `theme:${theme.name}`, group: "Actions", label: `${theme.label} theme`, keywords: ["appearance", "colours", "colors", theme.blurb], leading: <span className="size-3.5 shrink-0 rounded-full ring-1 ring-line" style={{ background: theme.swatch.brand }} />, run: () => setAppearance({ theme: theme.name }) })),
    { id: "sign-out", group: "Actions", label: "Sign out", keywords: ["log out"], leading: <Icon name="logout" />, run: onSignOut },
  ];

  const { showJumpHints } = useGlobalShortcuts({
    settingsOpen,
    onJump: (index) => {
      const target = targets[index];
      if (target) select(target);
    },
    onSearch: () => setPaletteOpen(!paletteOpen),
    onNewChat: () => setNewMenuOpen(!newMenuOpen),
    onSettings: () => settingsOpen ? setSettingsOpen(false) : openSettings(),
    onCycleFocus: (backwards) => {
      const current = document.activeElement?.closest<HTMLElement>("[data-focus-area]")?.dataset.focusArea as FocusArea | undefined;
      // Only the areas on screen take part: a run adds its open terminal and panel.
      const shown = FOCUS_ORDER.filter((area) => {
        const element = document.querySelector(`[data-focus-area="${area}"]`);
        return element && !element.closest("[inert]");
      });
      const next = nextFocusArea(current ?? null, shown, backwards);
      if (next) focusArea(next);
    },
    onToggleDiff: () => {
      if (run && codingOn) changePanels({ diff: !panels.diff });
    },
    onToggleTerminal: () => {
      if (run && codingOn) changePanels({ terminal: !panels.terminal });
    },
  });

  const repo = codingOn && selection.kind === "repo" ? REPOS.find((candidate) => candidate.id === selection.id) : undefined;

  return (
    <TooltipProvider>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} items={paletteItems} />
      <div className="workspace-shell relative flex min-h-0 flex-1" data-sidebar-open={sidebarOpen} data-platform={window.mates.platform}>
        <TitleBar sidebarOpen={sidebarOpen} onToggleSidebar={() => setSidebarOpen((open) => !open)} />
        <div className="workspace-sidebar-slot relative shrink-0">
          <div className="workspace-sidebar absolute inset-y-0 left-0 flex w-(--sidebar-width)" inert={!sidebarOpen}>
            <Sidebar
              you={you}
              chats={chats}
              mates={liveMates}
              unread={unread}
              runs={runRows}
              showProjects={codingOn}
              selection={selection}
              jumpTargets={targets}
              showJumpHints={showJumpHints}
              onSelect={select}
              newMenuOpen={newMenuOpen}
              onNewMenuOpenChange={setNewMenuOpen}
              onNewMate={() => setCreating("mate")}
              onNewGroup={() => setCreating("group")}
              placeBadges={{
                activity: ACTIVITY.filter((item) => item.status === "needsYou").length,
                friends: FRIEND_REQUESTS.length + FRIENDS.filter((friend) => friend.notes.some((note) => note.kind === "waiting")).length,
              }}
              onOpenSettings={() => openSettings()}
              onOpenUsage={() => openSettings("usage")}
              onSignOut={onSignOut}
            />
          </div>
        </div>
        <main className="workspace-main min-w-0 flex-1">
          {chat && (
            <OpenRunContext value={openRun}>
            <OpenPageContext value={openPage}>
            <OpenChatContext value={openChat}>
              <ChatView
                key={chat.id}
                chat={chat}
                mates={liveMates}
                timelineMates={crewMates}
                flow={flow}
                dispatch={chatDispatch}
                composerRef={composerRef}
                quiet={activityMode === "quiet"}
                side={side}
                inCall={inCall}
                computerBusy={computer.power === "on" && liveGoal(computer) !== null}
                onSide={(next) => (next ? openSide(next, chat) : closeSide())}
                onEdit={() => setEditing(chat.id)}
                sidePanel={
                  side === "call" && call ? (
                    <CallPanel call={call} mates={liveMates} you={you} dispatch={callDispatch} onEnd={endCall} onClose={closeSide} />
                  ) : side === "computer" ? (
                    <ComputerPanel state={computer} dispatch={computerDispatch} mates={liveMates} chatMate={liveMates[chat.leadId]!} />
                  ) : side === "page" && page ? (
                    <PagePanel url={page} />
                  ) : null
                }
              />
            </OpenChatContext>
            </OpenPageContext>
            </OpenRunContext>
          )}
          {selection.kind === "place" && selection.id === "activity" && <ActivityPage mates={liveMates} onOpenChat={openChat} />}
          {selection.kind === "place" && selection.id === "routines" && <RoutinesPage mates={allMates} />}
          {selection.kind === "place" && selection.id === "friends" && <FriendsPage myEmail={email ?? ""} />}
          {repo && (
            <RepoPage
              key={repo.id}
              repo={repo}
              runs={runRows.filter((row) => row.run.repoId === repo.id)}
              mateName={coder.name}
              draft={codeDrafts[`repo:${repo.id}`] ?? ""}
              onDraft={(text) => setCodeDrafts({ ...codeDrafts, [`repo:${repo.id}`]: text })}
              onStart={(where) => startRun(repo.id, where)}
              onOpenRun={openRun}
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
              workbench={codingOn}
              draft={codeDrafts[run.id] ?? ""}
              onDraft={(text) => setCodeDrafts({ ...codeDrafts, [run.id]: text })}
              composerRef={composerRef}
            />
          )}
        </main>
      </div>
      {(() => {
        const target = editing ? chats.find((candidate) => candidate.id === editing) : undefined;
        if (!target) return null;
        const mate = allMates.find((candidate) => candidate.id === target.leadId);
        return target.kind === "group" ? (
          <NewGroupDialog
            open
            onOpenChange={(open) => !open && setEditing(null)}
            mates={allMates}
            initial={{ title: target.title, mateIds: target.mateIds }}
            onCreate={async ({ title, mateIds }) => {
              // The lead stays if still in the group; otherwise the first mate leads.
              const leadId = mateIds.includes(target.leadId) ? target.leadId : mateIds[0]!;
              const error = await actions.updateGroup(target.id, { title, mateIds, leadId });
              if (!error) setEditing(null);
              return error;
            }}
          />
        ) : mate ? (
          <NewMateDialog
            open
            onOpenChange={(open) => !open && setEditing(null)}
            initial={{ name: mate.name, role: mate.role, shape: mate.shape, color: mate.color }}
            onCreate={async (changes) => {
              const error = await actions.updateMate(mate.id, changes);
              if (!error) setEditing(null);
              return error;
            }}
          />
        ) : null;
      })()}
      <NewMateDialog open={creating === "mate"} onOpenChange={(open) => setCreating(open ? "mate" : null)} onCreate={createMate} />
      <NewGroupDialog open={creating === "group"} onOpenChange={(open) => setCreating(open ? "group" : null)} mates={allMates} onCreate={createGroup} />
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} activityMode={activityMode} onActivityMode={changeActivityMode} you={you} onSignOut={onSignOut} mates={Object.values(liveMates)} profile={profile} codingShown={codingOn} section={settingsSection} />
    </TooltipProvider>
  );
}
