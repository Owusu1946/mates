import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cannedReply, initialFlow, shownText } from "../chat/chatFlow.logic.ts";
import { MateAvatar } from "../chat/MateAvatar.tsx";
import { useChatFlowFrom } from "../chat/useChatFlow.ts";
import { Button } from "../components/ui/Button.tsx";
import { Kbd, MOD } from "../components/ui/Kbd.tsx";
import { crewFor, LEAD_ID, REPLIES } from "../data/sampleCrew.ts";
import { cn } from "../lib/utils.ts";
import { matchMates, mentionQuery, withoutMention } from "./summonInput.logic.ts";

// UI only: the bar asks the sample crew, as the main window does before the API is wired up.
const { mates } = crewFor("Ama");
const CHAT = "summon";

/**
 * The summon bar: Alt+Space (⌥Space on a Mac) from any app opens this pill. Type, `@` a mate, press
 * Enter; the reply streams in under the pill, and Open in Mates carries it into the full app.
 * Escape clears the answer, then hides the bar. Each clear starts a fresh conversation.
 */
export function SummonBar() {
  const [session, setSession] = useState(0);
  return <Conversation key={session} onReset={() => setSession(session + 1)} />;
}

function Conversation({ onReset }: { onReset: () => void }) {
  const [flow, dispatch] = useChatFlowFrom(() => initialFlow({}, {}));
  const [mateId, setMateId] = useState(LEAD_ID);
  const [picked, setPicked] = useState(0);
  const root = useRef<HTMLDivElement>(null);
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

  // The window is as tall as what's in it.
  useLayoutEffect(() => {
    const element = root.current!;
    const observer = new ResizeObserver(() => window.mates.summon.resize(element.offsetHeight));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Each time the bar opens, the cursor is ready in the field.
  useEffect(() => {
    input.current?.focus();
    return window.mates.summon.onShown(() => input.current?.focus());
  }, []);

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
    window.mates.summon.openInMates({ mateId, question, answer });
    onReset();
  };

  return (
    <div ref={root} className="p-3">
      <div className="overflow-hidden rounded-[26px] border border-line bg-raised/95 text-ink shadow-2xl shadow-black/25 backdrop-blur-xl dark:shadow-black/60">
        <div className="flex h-14 items-center gap-3 px-4">
          <MateAvatar mate={{ ...mate, status: reply ? (reply.phase === "thinking" ? "thinking" : "working") : "idle" }} size={28} />
          <input
            ref={input}
            value={draft}
            placeholder={`Ask ${mate.name}…  @ for another mate`}
            aria-label={`Ask ${mate.name}`}
            className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-ink-soft"
            onChange={(event) => {
              dispatch({ type: "draft", chatId: CHAT, text: event.target.value });
              setPicked(0);
            }}
            onKeyDown={(event) => {
              if (choices.length && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
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
                else window.mates.summon.hide();
              }
            }}
          />
          {reply ? <Kbd>Esc</Kbd> : <Kbd>↵</Kbd>}
        </div>

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
      </div>
    </div>
  );
}
