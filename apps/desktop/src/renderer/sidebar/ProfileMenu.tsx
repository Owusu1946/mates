import { Menu, MenuItem, MenuRadioGroup, MenuRadioItem, MenuSegmented, MenuSeparator, MenuSubmenu } from "../components/ui/Menu.tsx";
import type { ColorScheme, ThemeName } from "../theme/appearance.logic.ts";
import { USAGE } from "../data/sampleUsage.ts";
import { PLANS } from "../settings/usage.logic.ts";
import { UsageBar, usedText } from "../settings/UsageBar.tsx";
import { THEMES } from "../theme/appearance.logic.ts";
import { setAppearance, useAppearance } from "../theme/appearance.ts";

const SCHEMES: { value: ColorScheme; label: string; icon: "monitor" | "sun" | "moon" }[] = [
  { value: "system", label: "Match the system", icon: "monitor" },
  { value: "light", label: "Light", icon: "sun" },
  { value: "dark", label: "Dark", icon: "moon" },
];

function Swatch({ color }: { color: string }) {
  return <span aria-hidden="true" className="size-3 shrink-0 rounded-full ring-1 ring-line" style={{ background: color }} />;
}

/**
 * You, at the foot of the sidebar: your usage at a glance (opening Settings → Usage), the colour
 * scheme as one row of icons, the themes beside it, then Settings and Sign out.
 */
export function ProfileMenu({ you, onOpenSettings, onOpenUsage, onSignOut }: { you: string; onOpenSettings: () => void; onOpenUsage: () => void; onSignOut: () => void }) {
  const plan = PLANS.find((candidate) => candidate.id === USAGE.plan)?.label ?? USAGE.plan;
  const windows = [...(USAGE.plan === "max" ? [] : [{ label: "Session", window: USAGE.session }]), { label: "This week", window: USAGE.week }];
  const { scheme, theme } = useAppearance();
  const current = THEMES.find((option) => option.name === theme) ?? THEMES[0]!;
  return (
    <Menu
      side="top"
      trigger={
        <button
          type="button"
          className="flex h-11 w-full items-center gap-2 rounded-control px-(--sidebar-row-inset) text-left outline-none transition-colors duration-150 hover:bg-rail-hover focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-inset data-popup-open:bg-rail-hover"
        >
          <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-brand text-2xs font-semibold text-brand-ink">{you.charAt(0).toUpperCase()}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{you}</span>
            <span className="block text-2xs text-ink-soft">{plan} · {usedText(USAGE.week.usedPercent)} this week</span>
          </span>
        </button>
      }
    >
      <MenuItem onClick={onOpenUsage} className="h-auto flex-col items-stretch gap-1.5 py-2">
        <span className="flex items-baseline justify-between">
          <span className="text-sm">Usage</span>
          <span className="text-2xs text-ink-soft">{plan}</span>
        </span>
        {windows.map(({ label, window }) => (
          <span key={label} className="grid grid-cols-[4.5rem_minmax(0,1fr)_2.25rem] items-center gap-2 text-2xs text-ink-soft">
            {label}
            <UsageBar percent={window.usedPercent} className="h-1" />
            <span className="text-right tabular-nums">{Math.round(window.usedPercent)}%</span>
          </span>
        ))}
      </MenuItem>
      <MenuSeparator />
      <div className="flex items-center gap-3 py-1 ps-2 pe-1">
        <span className="flex-1 text-sm">Appearance</span>
        <div className="w-28">
          <MenuSegmented<ColorScheme> value={scheme} onChange={(next) => setAppearance({ scheme: next })} options={SCHEMES} />
        </div>
      </div>
      <MenuSubmenu
        label="Theme"
        detail={
          <>
            <Swatch color={current.swatch.brand} />
            {current.label}
          </>
        }
      >
        <MenuRadioGroup<ThemeName> value={theme} onChange={(next) => setAppearance({ theme: next })}>
          {THEMES.map((option) => (
            <MenuRadioItem key={option.name} value={option.name}>
              <span className="flex items-center gap-2">
                <Swatch color={option.swatch.brand} />
                {option.label}
              </span>
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuSubmenu>
      <MenuSeparator />
      <MenuItem icon="settings" onClick={onOpenSettings}>
        Settings
      </MenuItem>
      <MenuItem icon="logout" onClick={onSignOut}>
        Sign out
      </MenuItem>
    </Menu>
  );
}
