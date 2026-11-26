import { Icon } from "../components/ui/Icon.tsx";
import { Kbd, MOD } from "../components/ui/Kbd.tsx";
import { Menu, MenuItem } from "../components/ui/Menu.tsx";
import type { RunStatus } from "../code/runPlayer.logic.ts";
import { REPOS, type Chat, type Mate } from "../data/sampleCrew.ts";
import type { Run } from "../data/sampleRuns.ts";
import { jumpNumber, sameSelection, type Selection } from "./Sidebar.logic.ts";
import { ChatRow } from "./ChatRow.tsx";
import { GroupFace } from "./GroupFace.tsx";
import { MateRow } from "./MateRow.tsx";
import { MateAvatar } from "../chat/MateAvatar.tsx";
import { PinnedShelf } from "./PinnedShelf.tsx";
import { isShelfFull, pinnedChats } from "./pins.logic.ts";
import { togglePinned, usePins } from "./pins.ts";
import { SidebarRow } from "./SidebarRow.tsx";
import { ProfileMenu } from "./ProfileMenu.tsx";
import { RepoRow } from "./RepoRow.tsx";
import { SidebarSection } from "./SidebarSection.tsx";

type SidebarProps = {
  you: string;
  chats: Chat[];
  mates: Record<string, Mate>;
  unread: Record<string, boolean>;
  /** Each repo's runs, newest first, with how they're doing. */
  runs: { run: Run; status: RunStatus }[];
  /** Projects and their runs, only for people who code (settings/coding.logic.ts). */
  showProjects: boolean;
  selection: Selection;
  jumpTargets: Selection[];
  showJumpHints: boolean;
  onSelect: (selection: Selection) => void;
  /** The New menu: a mate or a group. Ctrl/⌘ N opens it too. */
  newMenuOpen: boolean;
  onNewMenuOpenChange: (open: boolean) => void;
  onNewMate: () => void;
  onNewGroup: () => void;
  /** How many things in each place need you: answers in What mates did, requests in Friends. */
  placeBadges: { activity: number; friends: number };
  onOpenSettings: () => void;
  onOpenUsage: () => void;
  onSignOut: () => void;
};

/**
 * The crew: New, the places, the mates you pinned on their shelf, then your mates and groups (and
 * projects, for people who code), with you at the bottom.
 */
export function Sidebar({
  you,
  chats,
  mates,
  unread,
  runs,
  showProjects,
  selection,
  jumpTargets,
  showJumpHints,
  onSelect,
  newMenuOpen,
  onNewMenuOpenChange,
  onNewMate,
  onNewGroup,
  placeBadges,
  onOpenSettings,
  onOpenUsage,
  onSignOut,
}: SidebarProps) {
  const { pins, hopped } = usePins();
  const pinned = pinnedChats(chats, pins);
  const full = isShelfFull(pins);
  const mateChats = chats.filter((chat) => chat.kind === "mate" && !pins.includes(chat.id));
  const groups = chats.filter((chat) => chat.kind === "group" && !pins.includes(chat.id));
  // Chats from before mates, folded away as on the phone.
  const earlier = chats.filter((chat) => chat.kind === "thread" && !pins.includes(chat.id));
  const groupMates = (chat: Chat) => chat.mateIds.flatMap((id) => (mates[id] ? [mates[id]] : []));
  const pinFor = (chat: Chat) => ({ full, onToggle: () => togglePinned(chat.id) });
  const repos = REPOS.map((repo) => ({ repo, runs: runs.filter(({ run }) => run.repoId === repo.id) }));
  const isSelected = (row: Selection) => sameSelection(selection, row);
  const jump = (row: Selection) => (showJumpHints ? jumpNumber(jumpTargets, row) : null);

  return (
    <nav data-focus-area="sidebar" aria-label="Crew" className="flex w-(--sidebar-width) shrink-0 flex-col border-r border-line bg-rail">
      <div className="sidebar-scroll flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-2 py-2">
        <Menu
          open={newMenuOpen}
          onOpenChange={onNewMenuOpenChange}
          trigger={
            <button
              type="button"
              className="flex h-8 w-full shrink-0 items-center gap-2 rounded-control px-(--sidebar-row-inset) text-left text-sm font-medium text-ink/80 outline-none transition-colors duration-150 hover:bg-rail-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-inset data-popup-open:bg-rail-hover [&_svg]:size-4 [&_svg]:text-ink-soft"
            >
              <Icon name="plus" />
              <span className="flex-1">New</span>
              <Kbd>
                {MOD} N
              </Kbd>
            </button>
          }
        >
          <MenuItem icon="plus" onClick={onNewMate}>
            New mate
          </MenuItem>
          <MenuItem icon="users" onClick={onNewGroup}>
            New group
          </MenuItem>
        </Menu>

        <div className="-mt-2 flex flex-col gap-px">
          {(
            [
              { id: "activity", label: "What mates did", icon: "activity", badge: placeBadges.activity },
              { id: "routines", label: "Routines", icon: "clock", badge: 0 },
              { id: "friends", label: "Friends", icon: "users", badge: placeBadges.friends },
            ] as const
          ).map((place) => (
            <SidebarRow
              key={place.id}
              leading={<Icon name={place.icon} />}
              label={place.label}
              meta={place.badge > 0 ? <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-caution/20 px-1 text-[10px] font-semibold text-caution-ink">{place.badge}</span> : undefined}
              selected={isSelected({ kind: "place", id: place.id })}
              onClick={() => onSelect({ kind: "place", id: place.id })}
            />
          ))}
        </div>

        {pinned.length > 0 && (
          <SidebarSection label="Pinned">
            <PinnedShelf
              hopped={hopped}
              onSelect={(id) => onSelect({ kind: "chat", id })}
              items={pinned.map((chat) => {
                const lead = mates[chat.leadId];
                return {
                  id: chat.id,
                  title: chat.title,
                  face: chat.kind === "group" ? <GroupFace mates={groupMates(chat)} /> : lead && <MateAvatar mate={lead} size={38} />,
                  unread: Boolean(unread[chat.id]),
                  needsYou: chat.kind === "mate" && lead?.status === "waiting",
                  selected: isSelected({ kind: "chat", id: chat.id }),
                  jump: jump({ kind: "chat", id: chat.id }),
                };
              })}
            />
          </SidebarSection>
        )}

        {mateChats.length > 0 && (
          <SidebarSection label="Mates">
            {mateChats.map((chat) => (
              <MateRow
                key={chat.id}
                chat={chat}
                mate={mates[chat.leadId]!}
                selected={isSelected({ kind: "chat", id: chat.id })}
                unread={Boolean(unread[chat.id])}
                jump={jump({ kind: "chat", id: chat.id })}
                onSelect={() => onSelect({ kind: "chat", id: chat.id })}
                pin={pinFor(chat)}
              />
            ))}
          </SidebarSection>
        )}

        {groups.length > 0 && (
          <SidebarSection label="Groups">
            {groups.map((chat) => (
              <ChatRow
                key={chat.id}
                face={<GroupFace mates={groupMates(chat)} />}
                title={chat.title}
                subtitle={chat.preview}
                time={chat.time}
                unread={Boolean(unread[chat.id])}
                selected={isSelected({ kind: "chat", id: chat.id })}
                jump={jump({ kind: "chat", id: chat.id })}
                onSelect={() => onSelect({ kind: "chat", id: chat.id })}
                pin={pinFor(chat)}
              />
            ))}
          </SidebarSection>
        )}

        {earlier.length > 0 && (
          <SidebarSection label={`Earlier chats · ${earlier.length}`} defaultOpen={false}>
            {earlier.map((chat) => (
              <ChatRow
                key={chat.id}
                face={mates[chat.leadId] && <MateAvatar mate={mates[chat.leadId]!} size={34} />}
                title={chat.title}
                subtitle={chat.preview}
                time={chat.time}
                unread={Boolean(unread[chat.id])}
                selected={isSelected({ kind: "chat", id: chat.id })}
                jump={null}
                onSelect={() => onSelect({ kind: "chat", id: chat.id })}
                pin={pinFor(chat)}
              />
            ))}
          </SidebarSection>
        )}

        {showProjects && repos.length > 0 && (
          <SidebarSection label="Projects">
            {repos.map(({ repo, runs: repoRuns }) => (
              <RepoRow
                key={repo.id}
                repo={repo}
                runs={repoRuns}
                isSelected={(kind, id) => isSelected({ kind, id })}
                onSelectRepo={() => onSelect({ kind: "repo", id: repo.id })}
                onSelectRun={(id) => onSelect({ kind: "run", id })}
              />
            ))}
          </SidebarSection>
        )}

      </div>

      <div className="shrink-0 px-2 pt-1 pb-2">
        <ProfileMenu you={you} onOpenSettings={onOpenSettings} onOpenUsage={onOpenUsage} onSignOut={onSignOut} />
      </div>
    </nav>
  );
}
