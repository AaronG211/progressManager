"use client";

import * as ToastPrimitive from "@radix-ui/react-toast";
import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";

export const ToastProvider = ToastPrimitive.Provider;

export function ToastMessage({
  className,
  ...props
}: ComponentProps<typeof ToastPrimitive.Root>) {
  return (
    <ToastPrimitive.Root
      className={cn(
        "grid w-[320px] gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-[var(--color-foreground)] shadow-lg",
        className,
      )}
      {...props}
    />
  );
}

export const ToastTitle = ToastPrimitive.Title;
export const ToastDescription = ToastPrimitive.Description;

export function ToastViewport({
  className,
  ...props
}: ComponentProps<typeof ToastPrimitive.Viewport>) {
  return (
    <ToastPrimitive.Viewport
      className={cn(
        "fixed bottom-4 right-4 z-[60] flex w-[360px] max-w-[calc(100%-2rem)] flex-col gap-2 outline-none",
        className,
      )}
      {...props}
    />
  );
}
