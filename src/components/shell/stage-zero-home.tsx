"use client";

import { CommandPaletteShell } from "@/components/shell/command-palette-shell";
import { Button } from "@/components/ui/button";
import {
  Dropdown,
  DropdownContent,
  DropdownItem,
  DropdownTrigger,
} from "@/components/ui/dropdown";
import { Input } from "@/components/ui/input";
import {
  ToastDescription,
  ToastMessage,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { getTelemetryClient } from "@/lib/observability";
import { useEffect, useState } from "react";

const telemetry = getTelemetryClient();

export function StageZeroHome() {
  const [workspaceName, setWorkspaceName] = useState("Launch Ops");
  const [template, setTemplate] = useState("Sprint Tracker");
  const [toastOpen, setToastOpen] = useState(false);

  useEffect(() => {
    telemetry.track("page_view", {
      page: "stage0_home",
    });
  }, []);

  const onCreateWorkspace = (): void => {
    telemetry.track("workspace_create_clicked", {
      workspaceName,
      template,
    });
    setToastOpen(true);
  };

  return (
    <ToastProvider swipeDirection="right">
      <TooltipProvider>
        <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-8 px-6 py-10 md:px-10">
          <header className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow-soft)]">
            <p className="text-sm uppercase tracking-[0.16em] text-[var(--color-foreground-subtle)]">
              Stage 0 Foundation
            </p>
            <h1 className="mt-3 text-3xl font-semibold text-[var(--color-foreground)] md:text-4xl">
              Build the Work OS control room
            </h1>
            <p className="mt-3 max-w-2xl text-sm text-[var(--color-foreground-muted)] md:text-base">
              Baseline architecture, UI primitives, health/readiness APIs, and deploy guardrails are now
              wired to support the Stage 1 boards buildout.
            </p>
          </header>

          <main className="grid gap-6 md:grid-cols-[1.2fr_1fr]">
            <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow-soft)]">
              <h2 className="text-lg font-semibold text-[var(--color-foreground)]">Create workspace</h2>
              <p className="mt-1 text-sm text-[var(--color-foreground-muted)]">
                Use shared components to create your first planning area.
              </p>

              <div className="mt-5 space-y-4">
                <label className="block text-sm text-[var(--color-foreground-muted)]" htmlFor="workspace-name">
                  Workspace name
                </label>
                <Input
                  id="workspace-name"
                  value={workspaceName}
                  onChange={(event) => setWorkspaceName(event.target.value)}
                  placeholder="Workspace name"
                />

                <div className="flex flex-wrap items-center gap-3">
                  <Dropdown>
                    <DropdownTrigger asChild>
                      <Button variant="secondary">Template: {template}</Button>
                    </DropdownTrigger>
                    <DropdownContent>
                      <DropdownItem onSelect={() => setTemplate("Sprint Tracker")}>
                        Sprint Tracker
                      </DropdownItem>
                      <DropdownItem onSelect={() => setTemplate("Product Roadmap")}>
                        Product Roadmap
                      </DropdownItem>
                      <DropdownItem onSelect={() => setTemplate("Campaign Planner")}>
                        Campaign Planner
                      </DropdownItem>
                    </DropdownContent>
                  </Dropdown>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span>
                        <Button onClick={onCreateWorkspace}>Create Workspace</Button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      This action emits a telemetry event and toast confirmation.
                    </TooltipContent>
                  </Tooltip>
                </div>
              </div>
            </section>

            <aside className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow-soft)]">
              <h2 className="text-lg font-semibold text-[var(--color-foreground)]">Quick actions</h2>
              <p className="mt-1 text-sm text-[var(--color-foreground-muted)]">
                Open command palette via button or keyboard shortcut.
              </p>
              <div className="mt-5 flex flex-col gap-3">
                <CommandPaletteShell
                  onAction={(actionId) => {
                    telemetry.track("command_palette_action", {
                      actionId,
                    });
                    setToastOpen(true);
                  }}
                />
                <p className="text-xs text-[var(--color-foreground-subtle)]">Shortcut: Ctrl/Cmd + K</p>
              </div>
            </aside>
          </main>
        </div>
      </TooltipProvider>

      <ToastMessage open={toastOpen} onOpenChange={setToastOpen}>
        <ToastTitle className="text-sm font-semibold">Action recorded</ToastTitle>
        <ToastDescription className="text-sm text-[var(--color-foreground-muted)]">
          Telemetry event queued and UI scaffold responded successfully.
        </ToastDescription>
      </ToastMessage>
      <ToastViewport />
    </ToastProvider>
  );
}
