"use client";

import { cn } from "@/lib/utils";
import { forwardRef, type InputHTMLAttributes } from "react";
import type { UIVariant } from "./types";

type InputVariant = Extract<UIVariant, "secondary" | "neutral">;

const inputVariants: Record<InputVariant, string> = {
  secondary:
    "border-[var(--color-border-strong)] bg-[var(--color-surface)] text-[var(--color-foreground)] focus:border-[var(--color-brand-500)]",
  neutral:
    "border-[var(--color-border)] bg-transparent text-[var(--color-foreground-muted)] focus:border-[var(--color-brand-400)]",
};

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  variant?: InputVariant;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, variant = "secondary", ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cn(
        "h-10 w-full rounded-lg border px-3 text-sm outline-none transition placeholder:text-[var(--color-foreground-subtle)] focus:ring-2 focus:ring-[var(--color-brand-200)]",
        inputVariants[variant],
        className,
      )}
      {...props}
    />
  );
});
