import { useEffect, useState } from "react";
import { Button } from "../components/ui/Button.tsx";
import type { Card, Message } from "../data/sampleCrew.ts";
import { ChatWorkActivity } from "./ChatWorkActivity.tsx";
import { MessageRow } from "./MessageRow.tsx";

const REQUEST: Message = { id: "request", author: "me", text: "Check my internet bill and pay it." };
const STEPS = ["Opened the December bill", "Compared it with last month", "Checked for extra charges"];
const PAYMENT: Extract<Card, { type: "approval" }> = {
  type: "approval",
  title: "Pay GH¢280 for internet?",
  detail: "Approve with your MoMo PIN.",
  meta: "MTN MoMo · December bill",
  allow: "Send prompt",
  state: "open",
};
const RESULT: Message = { id: "payment", author: "mate", text: "The bill is GH¢280, same as last month.", card: PAYMENT };

function PreviewChat({ quiet, progress }: { quiet: boolean; progress: number }) {
  const [answer, setAnswer] = useState(PAYMENT.state);
  const label = quiet ? "Quiet" : "Detailed";

  return (
    <div role="group" aria-label={`${label} sample`} className="min-w-0 rounded-xl border border-line bg-canvas">
      <h3 className="border-b border-line px-4 py-2.5 text-sm font-medium">{label}</h3>
      <div className="flex flex-col gap-3 p-4 text-sm">
        <MessageRow message={REQUEST} showAuthor={false} onAnswer={(_, state) => setAnswer(state)} />
        {!quiet && progress > 0 && <ChatWorkActivity steps={STEPS.slice(0, progress)} />}
        {progress > STEPS.length && (
          <MessageRow message={{ ...RESULT, card: { ...PAYMENT, state: answer } }} showAuthor={false} onAnswer={(_, state) => setAnswer(state)} />
        )}
      </div>
    </div>
  );
}

export function ChatActivityPreview() {
  const [progress, setProgress] = useState(STEPS.length + 1);
  const [replay, setReplay] = useState(0);

  useEffect(() => {
    if (progress > STEPS.length) return;
    const timer = setTimeout(() => setProgress(progress + 1), 700);
    return () => clearTimeout(timer);
  }, [progress, replay]);

  return (
    <section aria-labelledby="chat-activity-preview" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 id="chat-activity-preview" className="font-semibold">Sample conversation</h2>
          <p className="text-sm text-ink-soft">Both views use the same fictional bill.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => {
          setProgress(0);
          setReplay((count) => count + 1);
        }}>
          Replay sample
        </Button>
      </div>
      <div key={replay} className="grid items-start gap-3 min-[700px]:grid-cols-2">
        <PreviewChat quiet progress={progress} />
        <PreviewChat quiet={false} progress={progress} />
      </div>
    </section>
  );
}
