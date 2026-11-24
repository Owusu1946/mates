import { useState } from "react";
import { buttonVariants } from "../components/ui/Button.tsx";
import { Icon, type IconName } from "../components/ui/Icon.tsx";
import { USAGE } from "../data/sampleUsage.ts";
import { cn } from "../lib/utils.ts";
import { paceWarning, PLANS, resetText, type UsageWindow } from "./usage.logic.ts";
import { UsageBar, usedText } from "./UsageBar.tsx";

const COUNTS: { icon: IconName; label: string; detail: string }[] = [
  { icon: "message", label: "Chats and routines", detail: "Every reply, brief and routine run" },
  { icon: "phone", label: "Calls", detail: "Talking with your mates" },
  { icon: "monitor", label: "Your computer", detail: "While a mate uses it, by the minute" },
  { icon: "branch", label: "Coding", detail: "Runs and pull requests" },
];

function WindowRow({ title, window, now }: { title: string; window: UsageWindow; now: number }) {
  return (
    <div className="grid grid-cols-[minmax(0,12rem)_minmax(0,1fr)_5.5rem] items-center gap-4 py-3.5">
      <div>
        <div className="text-sm font-medium">{title}</div>
        <div className="text-xs text-ink-soft">{resetText(window, now)}</div>
      </div>
      <UsageBar percent={window.usedPercent} />
      <div className={cn("text-right text-sm tabular-nums", window.usedPercent >= 100 ? "text-danger-ink" : "text-ink-soft")}>{usedText(window.usedPercent)}</div>
    </div>
  );
}

/**
 * Settings → Usage, laid out like Claude's: your plan, a heads-up when your pace would reach a
 * limit before it resets, the 5-hour session and the week as percentages (as the app counts them,
 * apps/api/src/usage/plans.ts), what draws on them, and the plans.
 */
export function UsageSettings() {
  const [now] = useState(() => Date.now());
  const { plan, session, week } = USAGE;
  const label = PLANS.find((candidate) => candidate.id === plan)?.label ?? plan;
  const warning = paceWarning(week, now) ?? (plan === "max" ? null : paceWarning(session, now, "session"));

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-5 py-5 min-[850px]:px-7">
      <div className="flex items-baseline gap-2">
        <h2 className="text-base font-semibold">Your usage</h2>
        <span className="text-sm text-ink-soft">{label}</span>
      </div>

      {warning && <p className="text-[15px] font-medium">{warning}</p>}
      <div className="flex flex-wrap gap-2">
        {plan !== "max" && <button type="button" className={buttonVariants({ size: "default" })}>See plans</button>}
        <button type="button" className={buttonVariants({ variant: "secondary" })}>Manage subscription</button>
      </div>

      <section className="divide-y divide-line border-y border-line">
        {plan !== "max" && <WindowRow title="Current session" window={session} now={now} />}
        <WindowRow title="This week" window={week} now={now} />
      </section>
      <p className="-mt-3 text-xs text-ink-soft">{plan === "max" ? "Max has no session limit, only the weekly one." : "A session is 5 hours from your first message, and can use up to a quarter of your week."}</p>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">What counts</h3>
        <p className="text-sm text-ink-soft">One budget for everything your mates do for you.</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {COUNTS.map((item) => (
            <div key={item.label} className="flex items-center gap-3 rounded-xl border border-line px-3 py-2.5">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-soft text-ink-soft">
                <Icon name={item.icon} size={16} />
              </span>
              <span className="min-w-0">
                <span className="block text-sm">{item.label}</span>
                <span className="block text-2xs text-ink-soft">{item.detail}</span>
              </span>
            </div>
          ))}
        </div>
        <p className="text-xs text-ink-soft">Your computer and coding come with Pro and Max.</p>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">Plans</h3>
        <div className="grid grid-cols-4 gap-2">
          {PLANS.map((option) => (
            <div key={option.id} className={cn("rounded-xl border px-3 py-2.5", option.id === plan ? "border-brand bg-soft" : "border-line")}>
              <div className="text-sm font-medium">{option.label}</div>
              <div className="text-xs text-ink-soft">{option.multiple} usage</div>
              {option.id === plan && <div className="mt-1 text-2xs font-medium text-brand">Your plan</div>}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
