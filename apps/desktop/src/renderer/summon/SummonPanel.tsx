import { useEffect, useRef, useState } from "react";
import { cannedReply, initialFlow, shownText } from "../chat/chatFlow.logic.ts";
import { MateAvatar } from "../chat/MateAvatar.tsx";
import { useChatFlowFrom } from "../chat/useChatFlow.ts";
import { Button } from "../components/ui/Button.tsx";
import { Kbd, MOD } from "../components/ui/Kbd.tsx";
import { crewFor, LEAD_ID, REPLIES, VOICE_LINES } from "../data/sampleCrew.ts";
import { cn } from "../lib/utils.ts";
import { Icon } from "../components/ui/Icon.tsx";
import { joinDictation } from "../voice/dictation.logic.ts";
import { DictationMeter, DictationText } from "../voice/DictationParts.tsx";
import { ListeningBar } from "../voice/ListeningBar.tsx";
import { MicButton } from "../voice/MicButton.tsx";
import { useDictation } from "../voice/useDictation.ts";
import { useHoldToTalk } from "../voice/useHoldToTalk.ts";
import { matchMates, mentionQuery, withoutMention } from "./summonInput.logic.ts";

// UI only: the bar asks the sample crew, as the main window does before the API is wired up.
const { mates } = crewFor("Ama");
const CHAT = "summon";

export type SummonHandoff = { mateId: string; question: string; answer: string };

type SummonPanelProps = {
  /** Starts a fresh conversation (Escape after an answer, or after Open in Mates). */
  onReset: () => void;
  /** Escape with nothing to clear: the pill hides, the notch closes. */
  onHide: () => void;
  onOpenInMates: (handoff: SummonHandoff) => void;
  /** Changes each time the surface opens, so the cursor is ready in the field. */
  focusSignal: number;
};

/**
 * What the summon bar holds, wherever it's shown: the floating pill (SummonBar) or the MacBook
 * notch. Type, `@` a mate, press Enter, hold Space and speak, or click the mic to talk hands-free;
 * the reply streams in underneath, and Open in Mates carries it into the full app.
 */
export function SummonPanel({ onReset, onHide, onOpenInMates, focusSignal }: SummonPanelProps) {
  const [flow, dispatch] = useChatFlowFrom(() => initialFlow({}, {}));
  const [mateId, setMateId] = useState(LEAD_ID);
  const [picked, setPicked] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  const mate = mates.find((candidate) => candidate.id === mateId) ?? mates[0]!;
  const draft = flow.drafts[CHAT] ?? "";
  const messages = flow.messages[CHAT] ?? [];
  const reply = flow.replies[CHAT];
  const mention = mentionQuery(draft);
  const choices = mention === null ? [] : matchMates(mates, mention);
  const choice = Math.min(picked, Math.max(0, choices.length - 1));

  // Only the latest exchange shows: what you asked and what the mate said, or is saying.
  const askedAt = messages.findLastIndex((message) => message.author === "me");
  const question = askedAt >= 0 ? messages[askedAt]!.text : null;
  const answer = reply?.phase === "streaming" ? shownText(reply) : (messages.slice(askedAt + 1).find((message) => message.author !== "me")?.text ?? "");
  const done = question !== null && !reply;

  // Hold to talk: what you said goes in as your question and is sent when you let go.
  const voiceLine = VOICE_LINES[mateId] ?? "What's on my calendar today";
  const voice = useHoldToTalk({
    transcript: voiceLine,
    onSend: (text) => {
      dispatch({ type: "draft", chatId: CHAT, text });
      dispatch({ type: "send", chatId: CHAT, mateId, reply: cannedReply(REPLIES, mateId, flow.sent) });
      input.current?.focus();
    },
  });
  // The mic is hands-free: talk, pause if you like, then send. Nothing goes until you do.
  const dictation = useDictation(voiceLine);
  const sendDictation = () => {
    const text = joinDictation(draft, dictation.stop());
    if (!text.trim()) return;
    dispatch({ type: "draft", chatId: CHAT, text });
    dispatch({ type: "send", chatId: CHAT, mateId, reply: cannedReply(REPLIES, mateId, flow.sent) });
    input.current?.focus();
  };
  const startDictation = () => {
    dictation.start();
    input.current?.focus();
  };
  // Clicking away hides the bar; a hold or dictation in progress is dropped, not sent.
  useEffect(() => {
    const drop = () => {
      voice.cancel();
      dictation.cancel();
    };
    window.addEventListener("blur", drop);
    return () => window.removeEventListener("blur", drop);
  }, [voice.cancel, dictation.cancel]);

  // Each time the bar opens, the cursor is ready in the field.
  useEffect(() => {
    input.current?.focus();
  }, [focusSignal]);

  const pickMate = (id: string) => {
    setMateId(id);
    setPicked(0);
    dispatch({ type: "draft", chatId: CHAT, text: withoutMention(draft) });
  };
  const send = () => {
    if (!draft.trim() || reply) return;
    dispatch({ type: "send", chatId: CHAT, mateId, reply: cannedReply(REPLIES, mateId, flow.sent) });
  };
  const openInMates = () => {
    if (!done || question === null) return;
    onOpenInMates({ mateId, question, answer });
    onReset();
  };

  return (
    <>
        <div className="flex h-14 items-center gap-3 px-4">
          <MateAvatar mate={{ ...mate, status: voice.listening || dictation.active ? "listening" : reply ? (reply.phase === "thinking" ? "thinking" : "working") : "idle" }} size={28} />
          {voice.listening && voice.startedAt !== null && <ListeningBar startedAt={voice.startedAt} transcript={voiceLine} />}
          {dictation.clock && (
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <DictationMeter clock={dictation.clock} />
              <span className="flex-1 truncate text-sm text-ink-soft">{dictation.paused ? "Paused" : "Listening… Enter to send"}</span>
            </div>
          )}
          <input
            ref={input}
            value={draft}
            placeholder={`Ask ${mate.name}…  @ for another mate, hold Space to talk`}
            aria-label={`Ask ${mate.name}`}
            // Kept focused while you speak, so letting go of Space reaches it.
            className={cn("min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-ink-soft", (voice.listening || dictation.active) && "sr-only")}
            onChange={(event) => {
              dispatch({ type: "draft", chatId: CHAT, text: event.target.value });
              setPicked(0);
            }}
            onKeyUp={(event) => {
              if (event.key === " " && voice.listening) voice.release();
            }}
            onKeyDown={(event) => {
              if (voice.listening) {
                event.preventDefault();
                if (event.key === "Escape") voice.cancel();
                return;
              }
              if (dictation.active) {
                // Hands-free: Enter sends, Escape cancels, Space pauses; typing waits until you stop.
                event.preventDefault();
                if (event.key === "Escape") dictation.cancel();
                else if (event.key === "Enter") sendDictation();
                else if (event.key === " " && !event.repeat) dictation.togglePause();
                return;
              }
              if (event.key === " " && !draft && !reply) {
                // Space in an empty field holds to talk; there's nothing to type a space after.
                event.preventDefault();
                if (!event.repeat) voice.start();
              } else if (choices.length && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
                event.preventDefault();
                setPicked((choice + (event.key === "ArrowDown" ? 1 : choices.length - 1)) % choices.length);
              } else if (choices.length && (event.key === "Enter" || event.key === "Tab")) {
                event.preventDefault();
                pickMate(choices[choice]!.id);
              } else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                openInMates();
              } else if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                event.preventDefault();
                send();
              } else if (event.key === "Escape") {
                event.preventDefault();
                if (reply) dispatch({ type: "stop", chatId: CHAT });
                else if (question !== null || draft) onReset();
                else onHide();
              }
            }}
          />
          {dictation.active ? (
            <div className="flex shrink-0 items-center gap-1">
              <Button size="icon-sm" variant="ghost-muted" aria-label="Cancel" title="Cancel (Esc)" onClick={dictation.cancel}>
                <Icon name="x" />
              </Button>
              <Button size="icon-sm" variant="ghost-muted" aria-label={dictation.paused ? "Resume" : "Pause"} title={dictation.paused ? "Resume (Space)" : "Pause (Space)"} onClick={dictation.togglePause}>
                <Icon name={dictation.paused ? "mic" : "pause"} />
              </Button>
              <Button size="icon-sm" aria-label="Send" title="Send (Enter)" onClick={sendDictation}>
                <Icon name="arrowUp" />
              </Button>
            </div>
          ) : reply ? (
            <Kbd>Esc</Kbd>
          ) : voice.listening ? null : !draft ? (
            <MicButton onStart={startDictation} />
          ) : (
            <Kbd>↵</Kbd>
          )}
        </div>

        {voice.hint && <p className="animate-fade border-t border-line px-5 py-2 text-xs text-ink-soft">Hold Space while you speak, and let go to send. Or click the mic to talk hands-free.</p>}

        {dictation.clock && <DictationText clock={dictation.clock} transcript={voiceLine} before={draft} className="max-h-40 overflow-y-auto border-t border-line px-5 py-3 text-[15px] leading-relaxed" />}

        {choices.length > 0 && (
          <div role="listbox" aria-label="Mates" className="border-t border-line p-1.5">
            {choices.map((candidate, index) => (
              <div
                key={candidate.id}
                role="option"
                aria-selected={index === choice}
                onMouseMove={() => setPicked(index)}
                onMouseDown={(event) => {
                  event.preventDefault();
                  pickMate(candidate.id);
                }}
                className={cn("flex h-9 cursor-default items-center gap-2.5 rounded-xl px-2.5 text-sm", index === choice && "bg-hover-fill")}
              >
                <MateAvatar mate={{ ...candidate, status: "idle" }} size={18} />
                <span className="flex-1">{candidate.name}</span>
                <span className="text-xs text-ink-soft">{candidate.role}</span>
              </div>
            ))}
          </div>
        )}

        {question !== null && (
          <>
            <div className="max-h-80 overflow-y-auto border-t border-line px-5 py-4">
              <p className="truncate text-xs text-ink-soft">{question}</p>
              {reply?.phase === "thinking" ? (
                <p className="shimmer mt-2 text-sm">{mate.name} is thinking…</p>
              ) : (
                <p className="mt-2 leading-relaxed whitespace-pre-wrap select-text">{answer}</p>
              )}
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-line px-3 py-2">
              <span className="ps-2 text-2xs text-ink-soft">{reply ? "Esc to stop" : "Esc to clear"}</span>
              <Button size="sm" variant="secondary" disabled={!done} onClick={openInMates}>
                Open in Mates
                <Kbd>
                  {MOD} ↵
                </Kbd>
              </Button>
            </div>
          </>
        )}
    </>
  );
}
