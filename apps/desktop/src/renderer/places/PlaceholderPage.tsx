import { Icon, type IconName } from "../components/ui/Icon.tsx";

/** A place that isn't built yet on desktop: its name, and what it will hold. */
export function PlaceholderPage({ icon, title, body }: { icon: IconName; title: string; body: string }) {
  return (
    <div className="flex h-full animate-fade flex-col items-center justify-center gap-3 px-6 text-center">
      <span className="flex size-10 items-center justify-center rounded-xl border border-line bg-raised text-ink-soft">
        <Icon name={icon} size={18} />
      </span>
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="max-w-sm text-ink-soft">{body}</p>
      <p className="text-2xs text-ink-soft">Coming soon in desktop</p>
    </div>
  );
}
