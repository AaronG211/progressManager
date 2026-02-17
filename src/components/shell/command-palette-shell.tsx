"use client";

import { Button } from "@/components/ui/button";
import {
  Modal,
  ModalContent,
  ModalDescription,
  ModalHeader,
  ModalTitle,
  ModalTrigger,
} from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useEffect, useMemo, useState } from "react";

export type CommandAction = {
  id: string;
  label: string;
  description: string;
};

const DEFAULT_ACTIONS: CommandAction[] = [
  {
    id: "new-board",
    label: "Create board",
    description: "Create a blank board inside your current workspace.",
  },
  {
    id: "new-item",
    label: "Add item",
    description: "Insert a new row in your currently selected group.",
  },
  {
    id: "search",
    label: "Search item",
    description: "Jump to an item by name across groups.",
  },
];

type CommandPaletteShellProps = {
  actions?: CommandAction[];
  onAction?: (actionId: string) => void;
};

export function CommandPaletteShell({
  actions = DEFAULT_ACTIONS,
  onAction,
}: CommandPaletteShellProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const isToggle = event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey);
      if (!isToggle) {
        return;
      }

      event.preventDefault();
      setOpen((current) => !current);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const filteredActions = useMemo(() => {
    if (!query) {
      return actions;
    }

    const normalizedQuery = query.toLowerCase();
    return actions.filter((action) => action.label.toLowerCase().includes(normalizedQuery));
  }, [actions, query]);

  return (
    <Modal
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          setQuery("");
        }
      }}
    >
      <ModalTrigger asChild>
        <Button variant="secondary" aria-label="Open command palette">
          Command Palette
          <span className="rounded border border-[var(--color-border)] px-1.5 py-0.5 text-xs">
            Ctrl/Cmd + K
          </span>
        </Button>
      </ModalTrigger>
      <ModalContent>
        <ModalHeader>
          <ModalTitle>Command Palette</ModalTitle>
          <ModalDescription>
            Search actions and hit Enter to run the first matching command.
          </ModalDescription>
        </ModalHeader>

        <Input
          value={query}
          placeholder="Search commands"
          onChange={(event) => setQuery(event.target.value)}
          autoFocus
        />

        <ul className="mt-4 space-y-2">
          {filteredActions.map((action, index) => (
            <li key={action.id}>
              <button
                type="button"
                className={cn(
                  "w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-left transition",
                  "hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface-strong)]",
                  index === 0 && "border-[var(--color-brand-300)]",
                )}
                onClick={() => {
                  onAction?.(action.id);
                  setOpen(false);
                }}
              >
                <p className="text-sm font-medium text-[var(--color-foreground)]">{action.label}</p>
                <p className="text-xs text-[var(--color-foreground-muted)]">{action.description}</p>
              </button>
            </li>
          ))}
          {filteredActions.length === 0 && (
            <li className="rounded-lg border border-dashed border-[var(--color-border)] px-3 py-6 text-center text-sm text-[var(--color-foreground-muted)]">
              No commands match your search.
            </li>
          )}
        </ul>
      </ModalContent>
    </Modal>
  );
}
