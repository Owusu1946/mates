import { Icon } from "../components/ui/Icon.tsx";
import { MOD } from "../components/ui/Kbd.tsx";
import type { RunStatus } from "../code/runPlayer.logic.ts";
import { REPOS, type Chat, type Mate } from "../data/sampleCrew.ts";
import type { Run } from "../data/sampleRuns.ts";
import { jumpNumber, sameSelection, type Selection } from "./Sidebar.logic.ts";
import { MateRow } from "./MateRow.tsx";
import { ProfileMenu } from "./ProfileMenu.tsx";
import { RepoRow } from "./RepoRow.tsx";
import { SidebarRow } from "./SidebarRow.tsx";
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
  onNewChat: () => void;
  onOpenSettings: () => void;
  onSignOut: () => void;
};

/** The crew: chats, mates, groups and code, with your profile at the bottom. */
export function Sidebar({ you, chats, mates, unread, runs, showProjects, selection, jumpTargets, showJumpHints, onSelect, onNewChat, onOpenSettings, onSignOut }: SidebarProps) {
  const mateChats = chats.filter((chat) => chat.kind === "mate");
  const groups = chats.filter((chat) => chat.kind === "group");
  const threads = chats.filter((chat) => chat.kind === "thread");
  const repos = REPOS.map((repo) => ({ repo, runs: runs.filter(({ run }) => run.repoId === repo.id) }));
  const isSelected = (row: Selection) => sameSelection(selection, row);
  const jump = (row: Selection) => (showJumpHints ? jumpNumber(jumpTargets, row) : null);

  return (
    <nav data-focus-area="sidebar" aria-label="Crew" className="flex w-(--sidebar-width) shrink-0 flex-col border-r border-line bg-rail">
      <div className="sidebar-scroll flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-2 py-2">
        <SidebarRow leading={<Icon name="edit" />} label="New chat" meta={<span className="font-sans">{MOD} N</span>} onClick={onNewChat} />

        {threads.length > 0 && (
          <SidebarSection label="Chats">
            {threads.map((chat) => (
              <SidebarRow
                key={chat.id}
                leading={<Icon name="message" />}
                label={chat.title}
                selected={isSelected({ kind: "chat", id: chat.id })}
                onClick={() => onSelect({ kind: "chat", id: chat.id })}
              />
            ))}
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
              />
            ))}
          </SidebarSection>
        )}

        {groups.length > 0 && (
          <SidebarSection label="Groups">
            {groups.map((chat) => (
              <SidebarRow
                key={chat.id}
                leading={<Icon name="hash" />}
                label={chat.title}
                meta={chat.time}
                unread={Boolean(unread[chat.id])}
                selected={isSelected({ kind: "chat", id: chat.id })}
                jump={jump({ kind: "chat", id: chat.id })}
                onClick={() => onSelect({ kind: "chat", id: chat.id })}
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
        <ProfileMenu you={you} onOpenSettings={onOpenSettings} onSignOut={onSignOut} />
      </div>
    </nav>
  );
}
