import { Menu, MenuItem, MenuLabel, MenuRadioGroup, MenuRadioItem, MenuSeparator } from "../components/ui/Menu.tsx";
import type { ColorScheme, ThemeName } from "../theme/appearance.logic.ts";
import { THEMES } from "../theme/appearance.logic.ts";
import { setAppearance, useAppearance } from "../theme/appearance.ts";

/** You, at the foot of the sidebar: quick appearance switches, settings and signing out. */
export function ProfileMenu({ you, onOpenSettings, onSignOut }: { you: string; onOpenSettings: () => void; onSignOut: () => void }) {
  const { scheme, theme } = useAppearance();
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
            <span className="block text-2xs text-ink-soft">Sample workspace</span>
          </span>
        </button>
      }
    >
      <MenuLabel>Appearance</MenuLabel>
      <MenuRadioGroup<ColorScheme> value={scheme} onChange={(next) => setAppearance({ scheme: next })}>
        <MenuRadioItem value="system" icon="monitor">
          System
        </MenuRadioItem>
        <MenuRadioItem value="light" icon="sun">
          Light
        </MenuRadioItem>
        <MenuRadioItem value="dark" icon="moon">
          Dark
        </MenuRadioItem>
      </MenuRadioGroup>
      <MenuSeparator />
      <MenuLabel>Theme</MenuLabel>
      <MenuRadioGroup<ThemeName> value={theme} onChange={(next) => setAppearance({ theme: next })}>
        {THEMES.map((option) => (
          <MenuRadioItem key={option.name} value={option.name}>
            {option.label}
          </MenuRadioItem>
        ))}
      </MenuRadioGroup>
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
