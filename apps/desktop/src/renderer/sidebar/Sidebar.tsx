import { Icon } from "../components/ui/Icon.tsx";
import { MOD } from "../components/ui/Kbd.tsx";
import type { RunStatus } from "../code/runPlayer.logic.ts";
import { PLACES, REPOS, type Chat, type Mate } from "../data/sampleCrew.ts";
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
  selection: Selection;
  /** Narrows mates, groups, repos and runs to names containing it. */
  query: string;
  jumpTargets: Selection[];
  showJumpHints: boolean;
  onSelect: (selection: Selection) => void;
  onNewChat: () => void;
  onSignOut: () => void;
};

const matches = (name: string, query: string) => name.toLowerCase().includes(query.trim().toLowerCase());

/** The crew: new chat and places, then mates, groups and code, and you at the bottom (T3 Code's AppSidebarLayout). */
export function Sidebar({ you, chats, mates, unread, runs, selection, query, jumpTargets, showJumpHints, onSelect, onNewChat, onSignOut }: SidebarProps) {
  const shown = chats.filter((chat) => matches(chat.title, query));
  const mateChats = shown.filter((chat) => chat.kind === "mate");
  const groups = shown.filter((chat) => chat.kind === "group");
  // A repo shows when its name matches, with all its runs, or when any of its runs match.
  const repos = REPOS.flatMap((repo) => {
    const own = runs.filter(({ run }) => run.repoId === repo.id);
    if (matches(repo.name, query)) return [{ repo, runs: own }];
    const found = own.filter(({ run }) => matches(run.title, query));
    return found.length ? [{ repo, runs: found }] : [];
  });
  const isSelected = (row: Selection) => sameSelection(selection, row);
  const jump = (row: Selection) => (showJumpHints ? jumpNumber(jumpTargets, row) : null);

  return (
    <nav data-focus-area="sidebar" aria-label="Crew" className="flex w-(--sidebar-width) shrink-0 flex-col border-r border-line bg-rail">
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-2 py-2">
        <div className="flex flex-col gap-px">
          <SidebarRow leading={<Icon name="edit" />} label="New chat" meta={<span className="font-sans">{MOD} N</span>} onClick={onNewChat} />
          {PLACES.map((place) => (
            <SidebarRow
              key={place.id}
              leading={<Icon name={place.icon} />}
              label={place.label}
              meta={place.badge}
              selected={isSelected({ kind: "place", id: place.id })}
              onClick={() => onSelect({ kind: "place", id: place.id })}
            />
          ))}
        </div>

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

        {repos.length > 0 && (
          <SidebarSection label="Code">
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

        {query.trim() && !mateChats.length && !groups.length && !repos.length && <p className="px-(--sidebar-row-inset) text-xs text-ink-soft">Nothing called “{query.trim()}”.</p>}
      </div>

      <div className="border-t border-line p-2">
        <ProfileMenu you={you} onOpenSettings={() => onSelect({ kind: "place", id: "settings" })} onSignOut={onSignOut} />
      </div>
    </nav>
  );
}
