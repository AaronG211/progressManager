"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";

export const Modal = Dialog.Root;
export const ModalTrigger = Dialog.Trigger;
export const ModalClose = Dialog.Close;

export function ModalOverlay({
  className,
  ...props
}: ComponentProps<typeof Dialog.Overlay>) {
  return (
    <Dialog.Overlay
      className={cn("fixed inset-0 z-40 bg-black/45 backdrop-blur-[1px]", className)}
      {...props}
    />
  );
}

export function ModalContent({
  className,
  children,
  ...props
}: ComponentProps<typeof Dialog.Content>) {
  return (
    <Dialog.Portal>
      <ModalOverlay />
      <Dialog.Content
        className={cn(
          "fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-2xl",
          className,
        )}
        {...props}
      >
        {children}
      </Dialog.Content>
    </Dialog.Portal>
  );
}

export function ModalHeader({
  className,
  ...props
}: ComponentProps<"div">) {
  return <div className={cn("mb-4 flex flex-col gap-1", className)} {...props} />;
}

export function ModalTitle({
  className,
  ...props
}: ComponentProps<typeof Dialog.Title>) {
  return (
    <Dialog.Title
      className={cn("text-lg font-semibold text-[var(--color-foreground)]", className)}
      {...props}
    />
  );
}

export function ModalDescription({
  className,
  ...props
}: ComponentProps<typeof Dialog.Description>) {
  return (
    <Dialog.Description
      className={cn("text-sm text-[var(--color-foreground-muted)]", className)}
      {...props}
    />
  );
}
