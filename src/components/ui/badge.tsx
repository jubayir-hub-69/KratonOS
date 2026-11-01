import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors",
  {
    variants: {
      variant: {
        default:
          "border-[var(--border-color)] bg-[var(--bg-card-subtle)] text-[var(--text-primary)]",
        secondary:
          "border-[var(--border-color)] bg-[var(--bg-card-subtle)] text-[var(--text-secondary)]",
        emerald:
          "border-emerald-500/40 bg-emerald-500/15 text-[var(--accent-emerald)]",
        sky:
          "border-sky-500/40 bg-sky-500/15 text-[var(--accent-cyan)]",
        amber:
          "border-amber-500/40 bg-amber-500/15 text-amber-600 dark:text-amber-300",
        destructive:
          "border-rose-500/40 bg-rose-500/15 text-rose-600 dark:text-rose-300",
        red:
          "border-rose-500/40 bg-rose-500/15 text-rose-600 dark:text-rose-300",
        outline:
          "border-[var(--border-color)] bg-[var(--bg-card)] text-[var(--text-primary)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
