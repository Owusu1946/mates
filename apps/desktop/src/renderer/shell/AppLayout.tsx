import { useEffect, useRef, useState } from "react";
import type { ChatActivityMode } from "../chat/activityModes.ts";
import type { ChatAction } from "../chat/chatFlow.logic.ts";
import { ChatView } from "../chat/ChatView.tsx";
import { MateAvatar } from "../chat/MateAvatar.tsx";
import { OpenRunContext } from "../chat/openRun.ts";
import { formatCallTime } from "../call/call.logic.ts";
import { CallPanel } from "../call/CallPanel.tsx";
import { useCall } from "../call/useCall.ts";
import type { SidePanel } from "../chat/ChatHeader.tsx";
import { useChatFlow } from "../chat/useChatFlow.ts";
import { liveGoal } from "../computer/computer.logic.ts";
import { ComputerPanel } from "../computer/ComputerPanel.tsx";
import { useComputer } from "../computer/useComputers.ts";
import { useMateMoods } from "../chat/useMateMoods.ts";
import { RepoPage } from "../code/RepoPage.tsx";
import { runStatus } from "../code/runPlayer.logic.ts";
import { RunStatusDot } from "../code/RunStatusDot.tsx";
import { RunView, type CodePanels } from "../code/RunView.tsx";
import { useRunPlayer } from "../code/useRunPlayer.ts";
import { Icon } from "../components/ui/Icon.tsx";
import { MOD } from "../components/ui/Kbd.tsx";
import { TooltipProvider } from "../components/ui/Tooltip.tsx";
import { REPOS, type Chat, type Crew, type Mate } from "../data/sampleCrew.ts";
import { MATE_ID, newRun, RUNS, type Run } from "../data/sampleRuns.ts";
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

/** The crew window: title bar, sidebar and whatever's selected (T3 Code's AppSidebarLayout). */
export function AppLayout({ crew, onSignOut }: { crew: Crew; onSignOut: () => void }) {
  const [flow, dispatch] = useChatFlow(crew);
  const [selection, setSelection] = useState<Selection>({ kind: "chat", id: "chat-lead" });
  // Mates and groups you make here join the crew's.
  const [made, setMade] = useState<{ mates: Mate[]; chats: Chat[] }>({ mates: [], chats: [] });
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const [creating, setCreating] = useState<"mate" | "group" | null>(null);
  // Call and Computer: one call for the whole app, so switching chats doesn't drop it, and your
  // one computer, shared by your mates. The panel beside the chat shows one or the other.
  const [call, callDispatch] = useCall();
  const [computer, computerDispatch] = useComputer();
  const [side, setSide] = useState<SidePanel>(null);
  const computerGoal = computer.power === "on" ? liveGoal(computer) : null;
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

  // Edits to mates and groups, kept over the crew's own (UI only, until they reach the API).
  const [edited, setEdited] = useState<{ mates: Record<string, Partial<Mate>>; chats: Record<string, Partial<Chat>> }>({ mates: {}, chats: {} });
  const [editing, setEditing] = useState<string | null>(null);
  const allMates = [...crew.mates, ...made.mates].map((mate) => ({ ...mate, ...edited.mates[mate.id] }));
  const mateNames = Object.fromEntries(allMates.map((mate) => [mate.id, mate.name]));
  // A mate's chat is called what the mate is.
  const chats = [...crew.chats, ...made.chats].map((chat) => ({ ...chat, ...edited.chats[chat.id], ...(chat.kind === "mate" ? { title: mateNames[chat.leadId] ?? chat.title } : {}) }));
  // A mate's mood shows everywhere, its sidebar face and the header: listening while you type to
  // it, thinking, working, happy when it's done (chat/mateMood.logic.ts).
  const moods = useMateMoods(flow.replies);
  const liveMates: Record<string, Mate> = Object.fromEntries(
    allMates.map((mate) => {
      const status = moods.moodOf(mate.id);
      if (status) return [mate.id, { ...mate, status }];
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
  const run = selection.kind === "run" ? runs.find((candidate) => candidate.id === selection.id) : undefined;
  const coder = crewMates[MATE_ID]!;
  // Coding is a side of Mates, not the centre: its tools show only for people who code.
  const coding = useCoding();
  const codingOn = showsCoding(coding.preference, { engaged: coding.engaged, hasProjects: crew.hasProjects !== false });
  const runRows = runs.flatMap((candidate) => (runStates[candidate.id] ? [{ run: candidate, status: runStatus(runStates[candidate.id]!) }] : []));

  const select = (next: Selection) => {
    setSelection(next);
    if (next.kind === "chat") dispatch({ type: "open", chatId: next.id });
    // A run plays the first time you open it.
    if (next.kind === "run") runDispatch({ type: "start", runId: next.id, at: Date.now() });
  };

  // Seeing a mate's code work counts as starting to code: in Automatic, Projects appears from here.
  const openRun = (runId: string) => {
    markCodingEngaged();
    select({ kind: "run", id: runId });
  };

  const askToBuild = () => {
    select({ kind: "chat", id: "chat-yaw" });
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
    setSide(next);
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
    setSide(null);
  };

  /** Opens a chat and puts the cursor in its composer, once the chat view has mounted. */
  const openChat = (chatId: string) => {
    select({ kind: "chat", id: chatId });
    requestAnimationFrame(() => composerRef.current?.focus());
  };

  // A new mate joins the sidebar with its own chat and says hello.
  const createMate = ({ name, role, shape, color }: NewMate) => {
    const id = `mate-${crypto.randomUUID()}`;
    const mate: Mate = { id, name, role, shape, color, status: "idle" };
    const chat: Chat = { id: `chat-${id}`, kind: "mate", title: name, mateIds: [id], leadId: id, preview: "Say hello", time: "now" };
    setMade({ mates: [...made.mates, mate], chats: [...made.chats, chat] });
    dispatch({ type: "append", chatId: chat.id, messages: [{ id: `${id}-hello`, author: id, day: "Today", text: `Hi, I'm ${name}. What would you like me to take care of?` }] });
    setCreating(null);
    openChat(chat.id);
  };

  // A new group: the first mate chosen leads it and opens the conversation.
  const createGroup = ({ title, mateIds }: NewGroup) => {
    const id = `group-${crypto.randomUUID()}`;
    const lead = crewMates[mateIds[0]!]!;
    const chat: Chat = { id, kind: "group", title, mateIds, leadId: lead.id, preview: `${lead.name}: What are we working on?`, time: "now" };
    setMade({ ...made, chats: [...made.chats, chat] });
    dispatch({ type: "append", chatId: id, messages: [{ id: `${id}-hello`, author: lead.id, day: "Today", text: "Everyone's here. What are we working on?" }] });
    setCreating(null);
    openChat(id);
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
      const shown = FOCUS_ORDER.filter((area) => document.querySelector(`[data-focus-area="${area}"]`));
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
      <TitleBar onSearch={() => setPaletteOpen(true)} />
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} items={paletteItems} />
      <div className="flex min-h-0 flex-1">
        <Sidebar
          you={crew.you}
          chats={chats}
          mates={liveMates}
          unread={flow.unread}
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
        <main className="min-w-0 flex-1">
          {chat && (
            <OpenRunContext value={openRun}>
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
                    <CallPanel call={call} mates={liveMates} you={crew.you} dispatch={callDispatch} onEnd={endCall} onClose={closeSide} />
                  ) : side === "computer" ? (
                    <ComputerPanel state={computer} dispatch={computerDispatch} mates={liveMates} chatMate={liveMates[chat.leadId]!} />
                  ) : null
                }
              />
            </OpenRunContext>
          )}
          {selection.kind === "place" && selection.id === "activity" && <ActivityPage mates={liveMates} onOpenChat={openChat} />}
          {selection.kind === "place" && selection.id === "routines" && <RoutinesPage mates={allMates} />}
          {selection.kind === "place" && selection.id === "friends" && <FriendsPage myEmail="ama@mates.app" />}
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
            onCreate={({ title, mateIds }) => {
              // The lead stays if still in the group; otherwise the first mate leads.
              const leadId = mateIds.includes(target.leadId) ? target.leadId : mateIds[0]!;
              setEdited({ ...edited, chats: { ...edited.chats, [target.id]: { title, mateIds, leadId } } });
              setEditing(null);
            }}
          />
        ) : mate ? (
          <NewMateDialog
            open
            onOpenChange={(open) => !open && setEditing(null)}
            initial={{ name: mate.name, role: mate.role, shape: mate.shape, color: mate.color }}
            onCreate={(changes) => {
              setEdited({ ...edited, mates: { ...edited.mates, [mate.id]: changes } });
              setEditing(null);
            }}
          />
        ) : null;
      })()}
      <NewMateDialog open={creating === "mate"} onOpenChange={(open) => setCreating(open ? "mate" : null)} onCreate={createMate} />
      <NewGroupDialog open={creating === "group"} onOpenChange={(open) => setCreating(open ? "group" : null)} mates={allMates} onCreate={createGroup} />
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} activityMode={activityMode} onActivityMode={changeActivityMode} you={crew.you} onSignOut={onSignOut} mates={Object.values(liveMates)} profile={crew.profile} codingShown={codingOn} section={settingsSection} />
    </TooltipProvider>
  );
}
