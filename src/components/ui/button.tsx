import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-lg text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 disabled:pointer-events-none disabled:opacity-50 cursor-pointer active:scale-[0.98]",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--accent-emerald)] text-[#04130D] shadow-sm hover:opacity-90 font-bold",
        emerald:
          "bg-[var(--accent-emerald)] text-[#04130D] shadow-sm hover:opacity-90 font-bold",
        destructive:
          "bg-rose-600 text-white shadow-sm hover:bg-rose-500 font-bold",
        outline:
          "border border-[var(--border-color)] bg-[var(--bg-card-subtle)] text-[var(--text-primary)] shadow-xs hover:border-[var(--accent-emerald)]",
        secondary:
          "bg-[var(--bg-card-subtle)] text-[var(--text-primary)] border border-[var(--border-color)] hover:border-[var(--accent-emerald)]",
        ghost:
          "text-[var(--text-secondary)] hover:bg-[var(--bg-card-subtle)] hover:text-[var(--text-primary)]",
        link: "text-[var(--accent-emerald)] underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8.5 rounded-md px-3 text-xs",
        lg: "h-11 rounded-lg px-6 text-sm",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
