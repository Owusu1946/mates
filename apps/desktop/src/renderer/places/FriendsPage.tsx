import { useState } from "react";
import { Button } from "../components/ui/Button.tsx";
import { Mascot } from "../components/ui/Mascot.tsx";
import { Switch } from "../components/ui/Switch.tsx";
import { TextField } from "../components/ui/TextField.tsx";
import { ASKED, FRIEND_REQUESTS, FRIENDS, ON_MATES, type Friend } from "../data/samplePlaces.ts";
import { cn } from "../lib/utils.ts";
import { gradientOf } from "../theme/matePalette.ts";
import { checkInvite, grantSummary, INVITE_MESSAGE, timeAgo, type FriendGrants, type InviteCheck } from "./places.logic.ts";

const GRANTS: { key: keyof FriendGrants; label: string; detail: (friend: Friend) => string }[] = [
  { key: "freeTime", label: "See when you're free", detail: (friend) => `${friend.mate.name} can find a time with your calendar, without the details.` },
  { key: "updates", label: "Pass on updates", detail: (friend) => `${friend.mate.name} can tell your mates news for you, like a change of plan.` },
  { key: "answers", label: "Get answers from your mate", detail: (friend) => `${friend.mate.name} can ask your lead mate things it already knows, without asking you.` },
];

const NOTE_PREFIX = { shared: "Your mate shared: ", answered: "You answered: ", waiting: "Waiting for an answer: " } as const;

/** A friend with their lead mate tucked against them. */
function FriendFace({ friend, size = 34 }: { friend: Friend; size?: number }) {
  return (
    <span className="relative block shrink-0" style={{ width: size, height: size }}>
      <span className="flex size-full items-center justify-center rounded-full bg-hover-fill text-xs font-semibold">{friend.name.charAt(0)}</span>
      <span className="absolute -right-1.5 -bottom-1 rounded-full bg-canvas">
        <Mascot size={Math.round(size * 0.55)} gradient={gradientOf(friend.mate.color)} shape={friend.mate.shape} still />
      </span>
    </span>
  );
}

function FriendDetail({ friend, onChange, onRemove }: { friend: Friend; onChange: (friend: Friend) => void; onRemove: () => void }) {
  const [ending, setEnding] = useState(false);
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6 px-6 py-6">
      <div className="flex items-center gap-3">
        <FriendFace friend={friend} size={48} />
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold">{friend.name}</h2>
          <p className="text-xs text-ink-soft">
            {friend.email} · their mate is {friend.mate.name}
          </p>
        </div>
      </div>

      <TextField label="What you call them" placeholder="Uncle Kofi" maxLength={40} value={friend.nickname} onChange={(event) => onChange({ ...friend, nickname: event.target.value })} />

      <section className="flex flex-col gap-3">
        <div>
          <h3 className="text-sm font-semibold">Between your mates</h3>
          <p className="text-xs text-ink-soft">What {friend.mate.name} may do with your mates without asking you. Anything else, your mate asks you first.</p>
        </div>
        {GRANTS.map((grant) => (
          <div key={grant.key} className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm">{grant.label}</div>
              <div className="text-2xs text-ink-soft">{grant.detail(friend)}</div>
            </div>
            <Switch label={grant.label} on={friend.grants[grant.key]} onChange={(on) => onChange({ ...friend, grants: { ...friend.grants, [grant.key]: on } })} />
          </div>
        ))}
      </section>

      {friend.notes.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">Lately</h3>
          {friend.notes.map((note) => (
            <div key={note.at} className={cn("rounded-xl border px-3 py-2.5 text-sm", note.kind === "waiting" ? "border-caution/40 bg-caution-surface" : "border-line")}>
              <span className="text-ink-soft">{NOTE_PREFIX[note.kind]}</span>
              {note.text}
              <span className="ms-2 text-2xs text-ink-soft">{timeAgo(note.at, Date.now())}</span>
            </div>
          ))}
        </section>
      )}

      <section className="flex flex-col gap-2">
        {ending ? (
          <div className="animate-fade rounded-xl border border-line p-3.5">
            <p className="text-sm">Your mates stop working together. You can connect again later.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={onRemove}>
                Remove friend
              </Button>
              <Button size="sm" variant="ghost" className="text-danger-ink" onClick={onRemove}>
                Block
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEnding(false)}>
                Keep
              </Button>
            </div>
            <p className="mt-2 text-2xs text-ink-soft">Blocking means they can't reach you or connect again. They aren't told.</p>
          </div>
        ) : (
          <Button variant="ghost" size="sm" className="self-start text-danger-ink" onClick={() => setEnding(true)}>
            Remove friend
          </Button>
        )}
      </section>
    </div>
  );
}

/**
 * Friends whose mates can work with yours, as on the phone (apps/mobile/app/(app)/friends.tsx and
 * friend.tsx): requests, your friends and what their mates may do, inviting someone, and each
 * friend's permissions and what passed between your mates.
 */
export function FriendsPage({ myEmail }: { myEmail: string }) {
  // UI only: friends live in the page until they reach the API.
  const [friends, setFriends] = useState(FRIENDS);
  const [requests, setRequests] = useState(FRIEND_REQUESTS);
  const [selected, setSelected] = useState<string | null>(FRIENDS[0]?.id ?? null);
  const [email, setEmail] = useState("");
  const [asked, setAsked] = useState(ASKED);
  const [result, setResult] = useState<{ check: InviteCheck; linkCopied?: boolean } | null>(null);
  const friend = friends.find((candidate) => candidate.id === selected);

  const invite = () => {
    const check = checkInvite(email, { me: myEmail, friends: friends.map((candidate) => candidate.email), asked, onMates: ON_MATES });
    if (check === "ok") {
      setAsked([...asked, email.trim().toLowerCase()]);
      setEmail("");
    }
    setResult({ check });
  };

  return (
    <div className="flex h-full animate-fade">
      <aside className="flex w-80 shrink-0 flex-col border-r border-line">
        <header className="flex h-13 shrink-0 flex-col justify-center border-b border-line px-4">
          <h2 className="text-sm font-semibold">Friends</h2>
          <p className="text-2xs text-ink-soft">Your mates, working with your friends'</p>
        </header>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-2">
          {requests.length > 0 && (
            <section className="flex flex-col gap-1">
              <h3 className="px-2.5 text-2xs font-medium text-ink-soft">Requests</h3>
              {requests.map((request) => (
                <div key={request.id} className="flex flex-col gap-2 rounded-xl bg-soft px-3 py-2.5">
                  <p className="text-sm">
                    <span className="font-medium">{request.name}</span> wants your mates to work with {request.mateName}.
                  </p>
                  <div className="flex gap-1.5">
                    <Button
                      size="xs"
                      onClick={() => {
                        setRequests(requests.filter((candidate) => candidate.id !== request.id));
                        const added: Friend = { id: `f-${request.id}`, name: request.name, email: request.email, nickname: request.name.split(" ")[0]!, mate: { name: request.mateName, shape: "circle", color: "green" }, grants: { freeTime: false, updates: false, answers: false }, notes: [] };
                        setFriends([...friends, added]);
                        setSelected(added.id);
                      }}
                    >
                      Accept
                    </Button>
                    <Button size="xs" variant="ghost" onClick={() => setRequests(requests.filter((candidate) => candidate.id !== request.id))}>
                      Decline
                    </Button>
                  </div>
                </div>
              ))}
            </section>
          )}

          <section className="flex flex-col gap-0.5">
            {friends.map((candidate) => (
              <button
                key={candidate.id}
                type="button"
                aria-current={candidate.id === selected ? "true" : undefined}
                onClick={() => setSelected(candidate.id)}
                className="flex items-center gap-3 rounded-xl px-2.5 py-2.5 text-left outline-none transition-colors hover:bg-hover-fill focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand aria-[current=true]:bg-soft"
              >
                <FriendFace friend={candidate} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-medium">{candidate.nickname || candidate.name}</span>
                    {candidate.notes.some((note) => note.kind === "waiting") && <span className="size-1.5 shrink-0 rounded-full bg-caution" aria-label="Waiting for you" />}
                  </span>
                  <span className="block truncate text-xs text-ink-soft">{grantSummary(candidate.grants)}</span>
                </span>
              </button>
            ))}
          </section>

          <form
            className="mt-auto flex flex-col gap-2 rounded-xl border border-line p-3"
            onSubmit={(event) => {
              event.preventDefault();
              invite();
            }}
          >
            <h3 className="text-sm font-semibold">Invite a friend</h3>
            <div className="flex gap-1.5">
              <input
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setResult(null);
                }}
                type="email"
                placeholder="Their email"
                aria-label="Their email"
                className="h-8 min-w-0 flex-1 rounded-control border border-field-line bg-raised px-2.5 text-sm outline-none focus:border-brand"
              />
              <Button size="sm" type="submit" disabled={!email.trim()}>
                Send
              </Button>
            </div>
            {result && (
              <div className="animate-fade text-xs">
                <p className={result.check === "ok" ? "text-ok-ink" : "text-ink-soft"}>{INVITE_MESSAGE[result.check]}</p>
                {result.check === "notOnMates" && (
                  <Button size="xs" variant="outline" className="mt-1.5" onClick={() => setResult({ check: "notOnMates", linkCopied: true })}>
                    {result.linkCopied ? "Link copied" : "Send a link"}
                  </Button>
                )}
              </div>
            )}
            <p className="text-2xs text-ink-soft">Add someone already on Mates by email.</p>
          </form>
        </div>
      </aside>
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
        {friend ? (
          <FriendDetail
            key={friend.id}
            friend={friend}
            onChange={(next) => setFriends(friends.map((candidate) => (candidate.id === next.id ? next : candidate)))}
            onRemove={() => {
              setFriends(friends.filter((candidate) => candidate.id !== friend.id));
              setSelected(friends.find((candidate) => candidate.id !== friend.id)?.id ?? null);
            }}
          />
        ) : (
          <p className="py-20 text-center text-sm text-ink-soft">No friends yet. Invite someone, and your mates can plan things with theirs.</p>
        )}
      </div>
    </div>
  );
}
