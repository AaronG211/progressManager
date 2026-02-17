"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";

export const Dropdown = DropdownMenu.Root;
export const DropdownTrigger = DropdownMenu.Trigger;

export function DropdownContent({
  className,
  sideOffset = 8,
  ...props
}: ComponentProps<typeof DropdownMenu.Content>) {
  return (
    <DropdownMenu.Portal>
      <DropdownMenu.Content
        sideOffset={sideOffset}
        className={cn(
          "z-50 min-w-44 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-1 text-[var(--color-foreground)] shadow-lg",
          className,
        )}
        {...props}
      />
    </DropdownMenu.Portal>
  );
}

export function DropdownItem({
  className,
  ...props
}: ComponentProps<typeof DropdownMenu.Item>) {
  return (
    <DropdownMenu.Item
      className={cn(
        "cursor-pointer rounded-md px-3 py-2 text-sm outline-none transition focus:bg-[var(--color-surface-strong)]",
        className,
      )}
      {...props}
    />
  );
}
