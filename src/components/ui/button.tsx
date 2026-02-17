"use client";

import { cn } from "@/lib/utils";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import type { UIVariant } from "./types";

const buttonVariants: Record<UIVariant, string> = {
  primary:
    "bg-[var(--color-brand-500)] text-[var(--color-brand-foreground)] hover:bg-[var(--color-brand-600)] focus-visible:ring-[var(--color-brand-300)]",
  secondary:
    "bg-[var(--color-surface-strong)] text-[var(--color-foreground)] hover:bg-[var(--color-surface-stronger)] focus-visible:ring-[var(--color-border-strong)]",
  neutral:
    "bg-transparent text-[var(--color-foreground-muted)] hover:bg-[var(--color-surface-strong)] focus-visible:ring-[var(--color-border)]",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: UIVariant;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "primary", loading = false, disabled, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-background)] disabled:cursor-not-allowed disabled:opacity-60",
        buttonVariants[variant],
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? "Loading..." : children}
    </button>
  );
});
