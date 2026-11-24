import type { HTMLAttributes, ReactNode } from "react";
import { Icon } from "../components/ui/Icon.tsx";
import { cn } from "../lib/utils.ts";

/**
 * The parts every onboarding screen is made of, as small slots (T3 Code's ComposerBanner
 * pattern): each owns its classes and takes `className` for layout only. Screens compose these
 * instead of copying markup.
 */

type SlotProps = HTMLAttributes<HTMLDivElement> & { children?: ReactNode };

function Root({ className, wide = false, ...rest }: SlotProps & { wide?: boolean }) {
  return <section className={cn("stagger flex w-full flex-col items-center text-center", wide ? "max-w-200" : "max-w-100", className)} {...rest} />;
}

function Back({ onClick, label = "Back" }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="-ml-2 mb-3 inline-flex items-center gap-1 self-start rounded-control px-2 py-1.5 text-xs text-ink-soft transition-colors hover:bg-hover-fill hover:text-ink"
    >
      <Icon name="arrowLeft" size={16} />
      {label}
    </button>
  );
}

function Hero({ className, ...rest }: SlotProps) {
  return <div aria-hidden="true" className={cn("mb-5 flex items-center justify-center", className)} {...rest} />;
}

function Title({ children }: { children: ReactNode }) {
  return <h1 className="text-[28px] leading-[1.15] font-semibold tracking-[-0.02em] text-balance">{children}</h1>;
}

function Body({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("mt-2 text-[15px] leading-relaxed text-pretty text-ink-soft [&_strong]:font-semibold [&_strong]:text-ink", className)}>{children}</p>;
}

function Content({ className, ...rest }: SlotProps) {
  return <div className={cn("mt-8 flex w-full flex-col gap-4.5 text-left", className)} {...rest} />;
}

function Actions({ className, ...rest }: SlotProps) {
  return <div className={cn("mt-8 w-full", className)} {...rest} />;
}

function Footer({ className, ...rest }: SlotProps) {
  return <div className={cn("mt-6 flex flex-wrap items-center justify-center gap-1.5 text-xs text-ink-soft", className)} {...rest} />;
}

export const OnboardingScreen = { Root, Back, Hero, Title, Body, Content, Actions, Footer };
