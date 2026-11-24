import type { ReactNode } from "react";
import { MateAvatar } from "../chat/MateAvatar.tsx";
import { Icon } from "../components/ui/Icon.tsx";
import type { Mate } from "../data/sampleCrew.ts";
import type { ScreenStep } from "./computer.logic.ts";

const ADDRESS: Record<string, string> = {
  "bolt-home": "bolt.com/ride",
  "bolt-pickup": "bolt.com/ride",
  "bolt-options": "bolt.com/ride/options",
  "bolt-pay": "pay.mtn.com.gh/momo",
  "bolt-done": "bolt.com/ride/trip",
  search: "google.com/search",
  listing: "bomsoheights.com",
};

const Field = ({ label, value }: { label: string; value?: string }) => (
  <div className="rounded-md border border-line bg-raised px-2 py-1.5">
    <div className="text-[8px] text-ink-soft">{label}</div>
    <div className="h-3 text-[10px]">{value}</div>
  </div>
);

/** The sample pages, drawn small in the theme's colours: enough to read what the mate is doing. */
function Page({ screen }: { screen: string }): ReactNode {
  switch (screen) {
    case "bolt-home":
    case "bolt-pickup": {
      const filled = screen === "bolt-pickup";
      return (
        <div className="flex h-full gap-2 p-3">
          <div className="flex w-2/5 flex-col gap-1.5">
            <div className="text-xs font-semibold">Where to?</div>
            <Field label="Pickup" value={filled ? "East Legon" : ""} />
            <Field label="Destination" value={filled ? "Accra Mall" : ""} />
            <div className="mt-auto h-5 rounded-md bg-ok/80" />
          </div>
          <div className="flex-1 rounded-md bg-[linear-gradient(135deg,color-mix(in_srgb,var(--ok)_18%,transparent),color-mix(in_srgb,var(--brand)_14%,transparent))]" />
        </div>
      );
    }
    case "bolt-options":
      return (
        <div className="flex flex-col gap-1.5 p-3">
          <div className="text-xs font-semibold">Choose a ride</div>
          {[
            ["Bolt", "GH¢38", "4 min"],
            ["Bolt Lite", "GH¢33", "9 min"],
            ["Comfort", "GH¢45", "6 min"],
          ].map(([name, price, eta], index) => (
            <div key={name} className={`flex items-center justify-between rounded-md border px-2 py-1.5 text-[10px] ${index === 0 ? "border-ok bg-ok/10" : "border-line bg-raised"}`}>
              <span className="font-medium">{name}</span>
              <span className="text-ink-soft">{eta}</span>
              <span className="font-semibold">{price}</span>
            </div>
          ))}
        </div>
      );
    case "bolt-pay":
      return (
        <div className="flex h-full items-center justify-center p-3">
          <div className="w-3/5 rounded-lg border border-line bg-raised p-3 text-center">
            <div className="text-[10px] text-ink-soft">MTN MoMo</div>
            <div className="mt-1 text-sm font-semibold">Pay GH¢38.00 to Bolt</div>
            <div className="mt-1 text-[10px] text-ink-soft">024 ••• 4417</div>
            <div className="mt-2 h-5 rounded-md bg-caution/80" />
          </div>
        </div>
      );
    case "bolt-done":
      return (
        <div className="flex h-full flex-col justify-center gap-1.5 p-4">
          <div className="text-xs font-semibold text-ok-ink">Driver on the way</div>
          <div className="text-[10px]">Kwame · Toyota Vitz · GT 4521-22</div>
          <div className="text-[10px] text-ink-soft">Arriving in 4 minutes</div>
        </div>
      );
    case "listing":
      return (
        <div className="flex h-full gap-2 p-3">
          <div className="w-2/5 rounded-md bg-[linear-gradient(160deg,color-mix(in_srgb,var(--caution)_22%,transparent),color-mix(in_srgb,var(--brand)_12%,transparent))]" />
          <div className="flex flex-1 flex-col gap-1">
            <div className="text-xs font-semibold">Bomso Heights</div>
            <div className="text-[10px] text-ink-soft">GH¢3,600 a year · 4 min walk</div>
            <div className="mt-1 text-[10px]">★★★★☆ "Quiet, close to campus, water every day."</div>
            <div className="text-[10px]">★★★★★ "Best value near KNUST."</div>
          </div>
        </div>
      );
    default:
      return (
        <div className="flex flex-col gap-2 p-3">
          <div className="h-5 w-3/4 rounded-full border border-line bg-raised" />
          {["Bomso Heights · GH¢3,600", "Ayeduase Lodge · GH¢3,200", "Kotei Court · GH¢3,900"].map((result) => (
            <div key={result}>
              <div className="text-[10px] font-medium text-brand">{result}</div>
              <div className="mt-0.5 h-1.5 w-11/12 rounded-full bg-hover-fill" />
            </div>
          ))}
        </div>
      );
  }
}

/**
 * The mate's screen, live: a browser with the page it's on, its mascot as the cursor gliding to
 * what it's doing (a CSS transition, so it costs nothing between steps), and a caption saying it.
 */
export function ComputerScreen({ mate, step, driving }: { mate: Mate; step: ScreenStep; driving: boolean }) {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg border border-line bg-canvas">
      <div className="flex h-7 shrink-0 items-center gap-2 border-b border-line bg-soft px-2">
        <span className="flex gap-1" aria-hidden="true">
          <span className="size-2 rounded-full bg-danger/60" />
          <span className="size-2 rounded-full bg-caution/60" />
          <span className="size-2 rounded-full bg-ok/60" />
        </span>
        <span className="flex h-4.5 min-w-0 flex-1 items-center gap-1 rounded-full bg-raised px-2 text-[10px] text-ink-soft">
          <Icon name="lock" size={10} />
          <span className="truncate">{ADDRESS[step.screen] ?? "about:blank"}</span>
        </span>
      </div>
      <div className="relative min-h-0 flex-1">
        <div key={step.screen} className="h-full animate-fade">
          <Page screen={step.screen} />
        </div>
        {!driving && (
          <span className="pointer-events-none absolute transition-[left,top] duration-700 ease-out-soft" style={{ left: `${step.cursor.x}%`, top: `${step.cursor.y}%` }}>
            <MateAvatar mate={{ ...mate, status: "working" }} size={18} />
          </span>
        )}
      </div>
    </div>
  );
}
