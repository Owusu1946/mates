import { cn } from "../lib/utils.ts";
import { NEW_STEPS } from "./OnboardingFlow.logic.ts";

/** Where a newcomer is: Account, Lead mate, About you, Memories. */
export function StepIndicator({ index }: { index: number }) {
  return (
    <ol className="mb-2 grid w-full max-w-100 grid-cols-4 gap-2" aria-label={`Step ${index + 1} of ${NEW_STEPS.length}`}>
      {NEW_STEPS.map((step, i) => (
        <li key={step.label} aria-current={i === index ? "step" : undefined} className="flex flex-col gap-1.5">
          <span className={cn("h-0.75 rounded-full transition-colors duration-300", i <= index ? "bg-ink" : "bg-line")} />
          <span className={cn("text-2xs", i === index ? "font-medium text-ink" : "text-ink-soft")}>{step.label}</span>
        </li>
      ))}
    </ol>
  );
}
