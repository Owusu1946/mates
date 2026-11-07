import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { PolygonState } from "@muse-clone/mascot";
import { mate, type Gradient } from "../palette";
import type { ShapeName } from "../shapes";
import Mascot from "./Mascot";
import "./CallDemo.css";

/**
 * The app's call screen (apps/mobile/app/(app)/call.tsx), playable on the page: pick mates, start
 * a call, and the mates take turns talking with live captions while every control works. Like the
 * app today, the voices are simulated; the flow, timings and states are the app's own.
 */

type Phase = "lobby" | "connecting" | "live" | "ended";
type BotMate = { id: string; name: string; role: string; gradient: Gradient; shape?: ShapeName; lines: string[] };
type Member = BotMate & { joining: boolean; speaking: boolean };
type Caption = { id: number; speaker: string; text: string };

const LEAD: BotMate = {
  id: "cooper",
  name: "Cooper",
  role: "Companion",
  gradient: mate("amber"),
  lines: ["Hey! I’m here. What are we planning?", "Got it. I’ll pull it together while we talk.", "Nova, can you check flights for Friday?"],
};
const OTHERS: BotMate[] = [
  { id: "nova", name: "Nova", role: "Research", gradient: mate("blue"), shape: "triangle", lines: ["Three options. The 9am is the cheapest.", "Prices dropped this morning, I’ll hold that one."] },
  { id: "ivy", name: "Ivy", role: "Planning", gradient: mate("green"), shape: "circle", lines: ["Thursday afternoon is free to pack.", "I’ll put the trip on your calendar."] },
  { id: "sol", name: "Sol", role: "Creative", gradient: mate("teal"), lines: ["I can draft your out-of-office note.", "Here’s a warmer version of it."] },
];

const CONNECT_MS = 1800;
const TURN_MS = 3600;
const SPEAK_MS = 2400;
const AUTOSTART_MS = 3500;

const duration = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const avatarState = (m: Member, listening: boolean): PolygonState => (m.joining ? "waking" : m.speaking ? "humming" : listening ? "listening" : "idle");
const asMember = (m: BotMate, joining: boolean): Member => ({ ...m, joining, speaking: false });

export default function CallDemo() {
  const root = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>("lobby");
  const [invited, setInvited] = useState<string[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [muted, setMuted] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [captionsOn, setCaptionsOn] = useState(true);
  const [captions, setCaptions] = useState<Caption[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [summary, setSummary] = useState<{ duration: number; members: BotMate[] } | null>(null);
  const [visible, setVisible] = useState(false);
  const touched = useRef(false);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const turn = useRef(0);
  const membersRef = useRef(members);
  membersRef.current = members;

  const later = useCallback((ms: number, fn: () => void) => {
    const id = setTimeout(() => {
      timers.current.delete(id);
      fn();
    }, ms);
    timers.current.add(id);
  }, []);
  const clearTimers = useCallback(() => {
    for (const id of timers.current) clearTimeout(id);
    timers.current.clear();
  }, []);
  useEffect(() => clearTimers, [clearTimers]);

  // Only run while someone can see it.
  useEffect(() => {
    const node = root.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(!!entry?.isIntersecting), { threshold: 0.35 });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const join = useCallback(
    (m: BotMate, delay: number) => {
      setMembers((list) => (list.some((x) => x.id === m.id) ? list : [...list, asMember(m, true)]));
      later(delay, () => setMembers((list) => list.map((x) => (x.id === m.id ? { ...x, joining: false } : x))));
    },
    [later],
  );

  const start = useCallback(
    (bringing: string[]) => {
      setPhase("connecting");
      setMembers([asMember(LEAD, true)]);
      setCaptions([]);
      setElapsed(0);
      turn.current = 0;
      later(CONNECT_MS, () => {
        setPhase("live");
        setMembers((list) => list.map((m) => ({ ...m, joining: false })));
        OTHERS.filter((m) => bringing.includes(m.id)).forEach((m, i) => join(m, 1200 + i * 900));
      });
    },
    [join, later],
  );

  // A visitor who just watches still sees a call: after a moment, Cooper calls with Nova along.
  useEffect(() => {
    if (!visible || phase !== "lobby" || touched.current) return;
    const id = setTimeout(() => {
      if (touched.current) return;
      setInvited(["nova"]);
      start(["nova"]);
    }, AUTOSTART_MS);
    return () => clearTimeout(id);
  }, [visible, phase, start]);

  // The conversation: one mate speaks at a time, captions follow.
  useEffect(() => {
    if (phase !== "live" || !visible) return;
    const clock = setInterval(() => setElapsed((s) => s + 1), 1000);
    const talk = setInterval(() => {
      const ready = membersRef.current.filter((m) => !m.joining);
      if (!ready.length) return;
      const speaker = ready[turn.current % ready.length]!;
      const line = speaker.lines[Math.floor(turn.current / ready.length) % speaker.lines.length]!;
      turn.current++;
      setMembers((list) => list.map((m) => ({ ...m, speaking: m.id === speaker.id })));
      setCaptions((list) => [...list.slice(-2), { id: Date.now(), speaker: speaker.name, text: line }]);
      later(SPEAK_MS, () => setMembers((list) => list.map((m) => (m.id === speaker.id ? { ...m, speaking: false } : m))));
    }, TURN_MS);
    return () => {
      clearInterval(clock);
      clearInterval(talk);
    };
  }, [phase, visible, later]);

  const act = (fn: () => void) => () => {
    touched.current = true;
    fn();
  };
  const end = () => {
    clearTimers();
    setSummary({ duration: elapsed, members: membersRef.current.map(({ joining: _j, speaking: _s, ...m }) => m) });
    setMembers([]);
    setPhase("ended");
  };
  const reset = () => {
    setSummary(null);
    setInvited([]);
    setPhase("lobby");
  };
  const addNext = () => {
    const next = OTHERS.find((m) => !membersRef.current.some((x) => x.id === m.id));
    if (next) join(next, 1400);
  };

  return (
    <div ref={root} className="cd" aria-label="Interactive call demo" role="group">
      {phase === "lobby" && (
        <div className="cd-screen cd-enter">
          <div className="cd-top">
            <Glass label="Close" onClick={act(() => setInvited([]))}>
              <Icon name="close" />
            </Glass>
          </div>
          <div className="cd-lobby">
            <Mascot size={120} state="idle" gradient={LEAD.gradient} />
            <h3>Talk with {LEAD.name}</h3>
            <p>Hop on a voice call. Bring bot mates along to research, plan or create with you.</p>
          </div>
          <div className="cd-bring">
            <div className="cd-label">Bring along</div>
            <div className="cd-chips">
              {OTHERS.map((m) => {
                const on = invited.includes(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    className={`cd-chip${on ? " on" : ""}`}
                    onClick={act(() => setInvited((list) => (on ? list.filter((x) => x !== m.id) : [...list, m.id])))}
                  >
                    <Mascot size={30} state="idle" gradient={m.gradient} shape={m.shape} />
                    <span>
                      <b>{m.name}</b>
                      <small>{m.role}</small>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <button type="button" className="cd-pill prominent" onClick={act(() => start(invited))}>
            <Icon name="call" />
            {invited.length ? `Start call with ${invited.length + 1}` : "Start call"}
          </button>
        </div>
      )}

      {phase === "connecting" && (
        <div className="cd-screen cd-center cd-enter">
          <div className="cd-ringwrap">
            <span className="cd-ring active round" />
            <Mascot size={130} state="waking" gradient={LEAD.gradient} />
          </div>
          <div className="cd-calling" aria-live="polite">
            Calling {LEAD.name}…
          </div>
          {invited.length > 0 && (
            <div className="cd-sub">{OTHERS.filter((m) => invited.includes(m.id)).map((m) => m.name).join(", ")} will join once you’re connected</div>
          )}
          <div className="cd-cancel">
            <Control icon="callEnd" label="Cancel" danger onClick={act(() => (clearTimers(), setMembers([]), setPhase("lobby")))} />
          </div>
        </div>
      )}

      {phase === "live" && (
        <Live
          members={members}
          muted={muted}
          speakerOn={speakerOn}
          captionsOn={captionsOn}
          captions={captions}
          elapsed={elapsed}
          canAdd={members.length < OTHERS.length + 1}
          onMute={act(() => setMuted((v) => !v))}
          onSpeaker={act(() => setSpeakerOn((v) => !v))}
          onCaptions={act(() => setCaptionsOn((v) => !v))}
          onAdd={act(addNext)}
          onEnd={act(end)}
        />
      )}

      {phase === "ended" && (
        <div className="cd-screen cd-center cd-enter">
          <div className="cd-faces">
            {(summary?.members ?? [LEAD]).map((m) => (
              <span key={m.id}>
                <Mascot size={60} state="happy" gradient={m.gradient} shape={m.shape} />
              </span>
            ))}
          </div>
          <h3>Call ended</h3>
          <div className="cd-sub">
            {duration(summary?.duration ?? 0)} · with {(summary?.members ?? [LEAD]).map((m) => m.name).join(", ")}
          </div>
          <div className="cd-endactions">
            <button type="button" className="cd-pill prominent" onClick={act(() => (reset(), start(invited)))}>
              <Icon name="call" />
              Call again
            </button>
            <button type="button" className="cd-pill" onClick={act(reset)}>
              Back to chat
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Live(props: {
  members: Member[];
  muted: boolean;
  speakerOn: boolean;
  captionsOn: boolean;
  captions: Caption[];
  elapsed: number;
  canAdd: boolean;
  onMute: () => void;
  onSpeaker: () => void;
  onCaptions: () => void;
  onAdd: () => void;
  onEnd: () => void;
}) {
  const { members, muted, captions, captionsOn } = props;
  const count = members.length;
  const listening = !muted && !members.some((m) => m.speaking);
  const speaking = members.find((m) => m.speaking);
  const avatar = count <= 1 ? 112 : count === 2 ? 84 : 60;
  return (
    <div className="cd-screen cd-enter">
      <div className="cd-livehead">
        <Glass label="Minimize call" onClick={() => undefined}>
          <Icon name="chevronDown" />
        </Glass>
        <div className="cd-title">
          <b>{count > 1 ? `${LEAD.name} + ${count - 1}` : LEAD.name}</b>
          <span>{duration(props.elapsed)}</span>
        </div>
        <Glass label="Add bot mates" onClick={props.onAdd} disabled={!props.canAdd}>
          <Icon name="addUser" />
        </Glass>
      </div>

      <div className={`cd-stage n${Math.min(count, 4)}`}>
        {members.map((m, i) => (
          <div key={m.id} className={`cd-tile${m.joining ? " joining" : ""}${count % 2 === 1 && count > 2 && i === count - 1 ? " span" : ""}`}>
            <Mascot size={avatar} state={avatarState(m, listening)} gradient={m.gradient} shape={m.shape} />
            <div className="cd-name">
              <b>{m.name}</b>
              <span>{m.joining ? "Joining…" : m.role}</span>
            </div>
            <span className={`cd-ring${m.speaking ? " active" : ""}`} />
          </div>
        ))}
        <div className="cd-self" aria-label={muted ? "You, muted" : "You"}>
          <b>You</b>
          {muted && (
            <span className="cd-mutedbadge">
              <Icon name="micOff" size={12} />
            </span>
          )}
          <span className={`cd-ring small${listening ? " active" : ""}`} />
        </div>
      </div>

      <div className="cd-captions" aria-live="polite">
        {captionsOn && captions.length > 0 ? (
          <div className="cd-capbox">
            {captions.slice(-2).map((line, i, all) => (
              <div key={line.id} className={`cd-cap${i === all.length - 1 ? " latest" : ""}`}>
                <b>{line.speaker}:</b> {line.text}
              </div>
            ))}
          </div>
        ) : (
          <div className="cd-hint">{muted ? "You’re muted" : speaking ? `${speaking.name} is talking` : "Listening…"}</div>
        )}
      </div>

      <div className="cd-controls">
        <Control icon={muted ? "micOff" : "mic"} label={muted ? "Unmute" : "Mute"} active={muted} onClick={props.onMute} />
        <Control icon={props.speakerOn ? "speaker" : "speakerOff"} label="Speaker" active={!props.speakerOn} onClick={props.onSpeaker} />
        <Control icon="captions" label="Captions" active={captionsOn} onClick={props.onCaptions} />
        <Control icon="addUser" label="Add" onClick={props.onAdd} disabled={!props.canAdd} />
        <Control icon="callEnd" label="End" danger onClick={props.onEnd} />
      </div>
    </div>
  );
}

function Glass({ label, onClick, children, disabled }: { label: string; onClick: () => void; children: ReactNode; disabled?: boolean }) {
  return (
    <button type="button" className="cd-glass" aria-label={label} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

function Control({ icon, label, onClick, active, danger, disabled }: { icon: IconName; label: string; onClick: () => void; active?: boolean; danger?: boolean; disabled?: boolean }) {
  return (
    <div className="cd-control">
      <button type="button" aria-label={label} aria-pressed={danger ? undefined : !!active} onClick={onClick} disabled={disabled} className={`cd-round${active ? " active" : ""}${danger ? " danger" : ""}`}>
        <Icon name={icon} />
      </button>
      <span>{label}</span>
    </div>
  );
}

type IconName = "mic" | "micOff" | "speaker" | "speakerOff" | "captions" | "addUser" | "callEnd" | "call" | "close" | "chevronDown";
const PHONE =
  "M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z";
const ICONS: Record<IconName, ReactNode> = {
  mic: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </>
  ),
  micOff: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3M4 4l16 16" />
    </>
  ),
  speaker: <path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4zM16 9a4.2 4.2 0 0 1 0 6M18.6 6.5a7.8 7.8 0 0 1 0 11" />,
  speakerOff: <path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4zM16.5 9.5l5 5M21.5 9.5l-5 5" />,
  captions: <path d="M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM7 11h4M13 11h4M7 15h6" />,
  addUser: <path d="M9 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20c.8-3.4 3.4-5.5 6.5-5.5s5.7 2.1 6.5 5.5M19 8v6M16 11h6" />,
  callEnd: <path d={PHONE} transform="rotate(135 12 12)" />,
  call: <path d={PHONE} />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  chevronDown: <path d="m6 9 6 6 6-6" />,
};

function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name]}
    </svg>
  );
}
