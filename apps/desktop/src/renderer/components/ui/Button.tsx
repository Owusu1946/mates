import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/utils.ts";
import { Icon, type IconName } from "./Icon.tsx";

/**
 * T3 Code's button (apps/web/src/components/ui/button.tsx): the look belongs to the variant and
 * size. `className` is for layout only (width, margin), never colour or shape.
 */
export const buttonVariants = cva(
  "relative inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-control border font-medium outline-none transition-[background-color,box-shadow,scale,opacity] duration-150 active:not-disabled:scale-[0.97] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand disabled:pointer-events-none disabled:opacity-64 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:size-4",
  {
    variants: {
      variant: {
        default:
          "border-brand bg-brand text-brand-ink shadow-xs shadow-brand/24 inset-shadow-[0_1px_rgb(255_255_255/16%)] hover:bg-brand/90 active:inset-shadow-[0_1px_rgb(0_0_0/8%)] active:shadow-none",
        outline:
          "border-field-line bg-raised text-ink shadow-xs/5 hover:bg-hover-fill dark:bg-field-line/30 dark:hover:bg-field-line/60 [&_svg]:text-ink-soft",
        secondary: "border-transparent bg-soft text-ink hover:bg-hover-fill",
        ghost: "border-transparent text-ink hover:bg-hover-fill [&_svg]:text-ink-soft",
        "ghost-muted": "border-transparent text-ink-soft hover:bg-hover-fill hover:text-ink",
        link: "border-transparent p-0 text-ink underline decoration-ink-soft/55 underline-offset-2 hover:decoration-current",
      },
      size: {
        xs: "h-6 gap-1 px-[7px] text-xs",
        sm: "h-7 gap-1.5 px-[9px] text-sm",
        default: "h-8 px-[11px] text-sm",
        lg: "h-9 px-[13px] text-sm",
        xl: "h-10 px-[15px] text-[15px] [&_svg]:size-4.5",
        icon: "size-8",
        "icon-sm": "size-7",
        "icon-xs": "size-6 [&_svg]:size-3.5",
      },
    },
    compoundVariants: [{ variant: "link", className: "h-auto px-0" }],
    defaultVariants: { variant: "default", size: "default" },
  },
);

type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> &
  VariantProps<typeof buttonVariants> & {
    icon?: IconName;
    loading?: boolean;
    children?: ReactNode;
  };

export function Button({ variant, size, icon, loading = false, disabled, className, children, type = "button", ...rest }: ButtonProps) {
  return (
    <button type={type} data-slot="button" className={cn(buttonVariants({ variant, size }), className)} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <span className="size-3.5 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden="true" /> : icon && <Icon name={icon} />}
      {children}
    </button>
  );
}
