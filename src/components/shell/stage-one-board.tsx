"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getSupabaseBrowserClient } from "@/lib/auth/supabase/browser";
import { getTelemetryClient } from "@/lib/observability";
import { filterBoardSnapshotByItemName, getStatusOptions } from "@/lib/stage1/search";
import type {
  StageOneBoardSnapshot,
  StageOneCellValue,
  StageOneColumn,
  StageOneColumnType,
  StageOneGroup,
  StageOneItem,
  StageOneStatusOption,
} from "@/lib/stage1/types";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

const telemetry = getTelemetryClient();

type EditableTextCellProps = {
  value: string;
  ariaLabel: string;
  allowEmpty?: boolean;
  onCommit: (nextValue: string) => Promise<void>;
};

function EditableTextCell({
  value,
  ariaLabel,
  allowEmpty = false,
  onCommit,
}: EditableTextCellProps) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const commit = async (): Promise<void> => {
    const normalized = allowEmpty ? draft : draft.trim();

    if (!allowEmpty && normalized.length === 0) {
      setDraft(value);
      return;
    }

    if (normalized === value) {
      return;
    }

    await onCommit(normalized);
  };

  return (
    <Input
      aria-label={ariaLabel}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        void commit();
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          void commit();
          event.currentTarget.blur();
        }

        if (event.key === "Escape") {
          event.preventDefault();
          setDraft(value);
          event.currentTarget.blur();
        }
      }}
      className="h-9 min-w-[160px]"
    />
  );
}

function getCell(item: StageOneItem, columnId: string): StageOneCellValue | undefined {
  return item.values.find((value) => value.columnId === columnId);
}

function upsertCellValue(item: StageOneItem, nextValue: StageOneCellValue): StageOneItem {
  const existingIndex = item.values.findIndex((value) => value.columnId === nextValue.columnId);

  if (existingIndex === -1) {
    return {
      ...item,
      values: [...item.values, nextValue],
    };
  }

  return {
    ...item,
    values: item.values.map((value, index) => (index === existingIndex ? nextValue : value)),
  };
}

function updateItemInBoard(
  board: StageOneBoardSnapshot,
  itemId: string,
  updater: (item: StageOneItem) => StageOneItem,
): StageOneBoardSnapshot {
  return {
    ...board,
    groups: board.groups.map((group) => ({
      ...group,
      items: group.items.map((item) => (item.id === itemId ? updater(item) : item)),
    })),
  };
}

class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function apiRequest<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    headers: {
      "Content-Type": "application/json",
    },
    ...init,
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    const message = payload?.message || `Request failed with status ${response.status}`;
    throw new ApiError(response.status, message);
  }

  return response.json() as Promise<T>;
}

function renderStatusSelect(
  item: StageOneItem,
  column: StageOneColumn,
  options: StageOneStatusOption[],
  onUpdateCell: (
    itemId: string,
    column: StageOneColumn,
    value: string | null,
  ) => Promise<void>,
) {
  const value = getCell(item, column.id)?.statusValue ?? "";

  return (
    <select
      value={value}
      className="h-9 min-w-[150px] rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-sm"
      onChange={(event) => {
        void onUpdateCell(item.id, column, event.target.value || null);
      }}
    >
      <option value="">Unassigned</option>
      {options.map((option) => (
        <option key={option.label} value={option.label}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function renderPersonSelect(
  item: StageOneItem,
  column: StageOneColumn,
  board: StageOneBoardSnapshot,
  onUpdateCell: (
    itemId: string,
    column: StageOneColumn,
    value: string | null,
  ) => Promise<void>,
) {
  const value = getCell(item, column.id)?.personId ?? "";

  return (
    <select
      value={value}
      className="h-9 min-w-[150px] rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-sm"
      onChange={(event) => {
        void onUpdateCell(item.id, column, event.target.value || null);
      }}
    >
      <option value="">Unassigned</option>
      {board.members.map((member) => (
        <option key={member.userId} value={member.userId}>
          {member.name || member.email}
        </option>
      ))}
    </select>
  );
}

function renderDateInput(
  item: StageOneItem,
  column: StageOneColumn,
  onUpdateCell: (
    itemId: string,
    column: StageOneColumn,
    value: string | null,
  ) => Promise<void>,
) {
  const isoValue = getCell(item, column.id)?.dateValue;
  const value = isoValue ? isoValue.slice(0, 10) : "";

  return (
    <Input
      type="date"
      className="h-9 min-w-[150px]"
      value={value}
      onChange={(event) => {
        void onUpdateCell(item.id, column, event.target.value || null);
      }}
    />
  );
}

function renderCell(
  item: StageOneItem,
  column: StageOneColumn,
  board: StageOneBoardSnapshot,
  onUpdateCell: (
    itemId: string,
    column: StageOneColumn,
    value: string | null,
  ) => Promise<void>,
) {
  const cell = getCell(item, column.id);

  if (column.type === "TEXT") {
    return (
      <EditableTextCell
        ariaLabel={`${column.name} for ${item.name}`}
        value={cell?.textValue ?? ""}
        allowEmpty
        onCommit={async (nextValue) => {
          await onUpdateCell(item.id, column, nextValue);
        }}
      />
    );
  }

  if (column.type === "STATUS") {
    const options = getStatusOptions(column.settings?.options);
    return renderStatusSelect(item, column, options, onUpdateCell);
  }

  if (column.type === "PERSON") {
    return renderPersonSelect(item, column, board, onUpdateCell);
  }

  return renderDateInput(item, column, onUpdateCell);
}

function emptyValueForColumnType(columnType: StageOneColumnType): Pick<
  StageOneCellValue,
  "textValue" | "statusValue" | "personId" | "dateValue"
> {
  if (columnType === "TEXT") {
    return { textValue: "", statusValue: null, personId: null, dateValue: null };
  }

  if (columnType === "STATUS") {
    return { textValue: null, statusValue: null, personId: null, dateValue: null };
  }

  if (columnType === "PERSON") {
    return { textValue: null, statusValue: null, personId: null, dateValue: null };
  }

  return { textValue: null, statusValue: null, personId: null, dateValue: null };
}

type StageOneBoardProps = {
  userLabel: string;
};

export function StageOneBoard({ userLabel }: StageOneBoardProps) {
  const router = useRouter();
  const [board, setBoard] = useState<StageOneBoardSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [groupNameDraft, setGroupNameDraft] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadBoard(): Promise<void> {
      try {
        const snapshot = await apiRequest<StageOneBoardSnapshot>("/api/boards/bootstrap");

        if (!mounted) {
          return;
        }

        setBoard(snapshot);
        telemetry.track("stage1_board_loaded", {
          boardId: snapshot.boardId,
          groupCount: snapshot.groups.length,
          columnCount: snapshot.columns.length,
        });
      } catch (error: unknown) {
        if (!mounted) {
          return;
        }

        if (error instanceof ApiError && error.status === 401) {
          router.replace("/login");
          return;
        }

        const message = error instanceof Error ? error.message : "Failed to load board";
        setErrorMessage(message);
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    void loadBoard();

    return () => {
      mounted = false;
    };
  }, [router]);

  const signOut = async (): Promise<void> => {
    const supabase = getSupabaseBrowserClient();

    if (supabase) {
      await supabase.auth.signOut();
    }

    router.replace("/login");
    router.refresh();
  };

  const visibleBoard = useMemo(() => {
    if (!board) {
      return null;
    }

    return filterBoardSnapshotByItemName(board, search);
  }, [board, search]);

  const updateGroup = async (groupId: string, patch: { name?: string; isCollapsed?: boolean }) => {
    if (!board) {
      return;
    }

    const previous = board;

    setBoard({
      ...board,
      groups: board.groups.map((group) =>
        group.id === groupId
          ? {
              ...group,
              ...patch,
            }
          : group,
      ),
    });

    try {
      await apiRequest(`/api/boards/${board.boardId}/groups/${groupId}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
    } catch (error: unknown) {
      setBoard(previous);
      setErrorMessage(error instanceof Error ? error.message : "Unable to update group");
    }
  };

  const createGroup = async () => {
    if (!board) {
      return;
    }

    const normalizedName = groupNameDraft.trim();

    if (!normalizedName) {
      return;
    }

    try {
      const createdGroup = await apiRequest<StageOneGroup>(`/api/boards/${board.boardId}/groups`, {
        method: "POST",
        body: JSON.stringify({ name: normalizedName }),
      });

      setBoard({
        ...board,
        groups: [...board.groups, { ...createdGroup, items: [] }],
      });
      setGroupNameDraft("");
      setErrorMessage(null);
    } catch (error: unknown) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to create group");
    }
  };

  const createItem = async (groupId: string) => {
    if (!board) {
      return;
    }

    try {
      const createdItem = await apiRequest<StageOneItem>(`/api/boards/${board.boardId}/items`, {
        method: "POST",
        body: JSON.stringify({
          groupId,
          name: "New task",
        }),
      });

      setBoard({
        ...board,
        groups: board.groups.map((group) =>
          group.id === groupId
            ? {
                ...group,
                items: [...group.items, createdItem],
              }
            : group,
        ),
      });
      setErrorMessage(null);
    } catch (error: unknown) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to create item");
    }
  };

  const updateItemName = async (itemId: string, name: string) => {
    if (!board) {
      return;
    }

    const previous = board;
    const optimistic = updateItemInBoard(board, itemId, (item) => ({
      ...item,
      name,
    }));

    setBoard(optimistic);

    try {
      await apiRequest(`/api/boards/${board.boardId}/items/${itemId}`, {
        method: "PATCH",
        body: JSON.stringify({ name }),
      });
    } catch (error: unknown) {
      setBoard(previous);
      setErrorMessage(error instanceof Error ? error.message : "Unable to update item name");
    }
  };

  const updateCell = async (itemId: string, column: StageOneColumn, value: string | null) => {
    if (!board) {
      return;
    }

    const previous = board;
    const payload: { textValue?: string | null; statusValue?: string | null; personId?: string | null; dateValue?: string | null } = {};

    if (column.type === "TEXT") {
      payload.textValue = value ?? "";
    }

    if (column.type === "STATUS") {
      payload.statusValue = value;
    }

    if (column.type === "PERSON") {
      payload.personId = value;
    }

    if (column.type === "DATE") {
      payload.dateValue = value;
    }

    const optimisticBoard = updateItemInBoard(board, itemId, (item) => {
      const existingCell = getCell(item, column.id);

      return upsertCellValue(item, {
        id: existingCell?.id ?? `temp-${itemId}-${column.id}`,
        itemId,
        columnId: column.id,
        ...emptyValueForColumnType(column.type),
        textValue: column.type === "TEXT" ? payload.textValue ?? "" : existingCell?.textValue ?? null,
        statusValue:
          column.type === "STATUS" ? payload.statusValue ?? null : existingCell?.statusValue ?? null,
        personId: column.type === "PERSON" ? payload.personId ?? null : existingCell?.personId ?? null,
        dateValue: column.type === "DATE" ? (payload.dateValue ? new Date(payload.dateValue).toISOString() : null) : existingCell?.dateValue ?? null,
      });
    });

    setBoard(optimisticBoard);

    try {
      const updatedCell = await apiRequest<StageOneCellValue>(
        `/api/boards/${board.boardId}/items/${itemId}/cells/${column.id}`,
        {
          method: "PATCH",
          body: JSON.stringify(payload),
        },
      );

      setBoard((current) => {
        if (!current) {
          return current;
        }

        return updateItemInBoard(current, itemId, (item) => upsertCellValue(item, updatedCell));
      });
    } catch (error: unknown) {
      setBoard(previous);
      setErrorMessage(error instanceof Error ? error.message : "Unable to update cell");
    }
  };

  if (isLoading) {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-6xl items-center justify-center px-6 text-sm text-[var(--color-foreground-muted)]">
        Loading board workspace...
      </div>
    );
  }

  if (!visibleBoard || !board) {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-6xl items-center justify-center px-6 text-sm text-rose-400">
        {errorMessage || "Unable to load board"}
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-5 px-4 py-6 md:px-8">
      <header className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-soft)]">
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--color-foreground-subtle)]">
            Stage 1 MVP
          </p>
          <div className="flex items-center gap-2 text-xs text-[var(--color-foreground-muted)]">
            <span className="rounded-md border border-[var(--color-border)] px-2 py-1">{userLabel}</span>
            <Button variant="neutral" className="h-8 px-3" onClick={() => void signOut()}>
              Sign out
            </Button>
          </div>
        </div>
        <h1 className="mt-2 text-2xl font-semibold text-[var(--color-foreground)] md:text-3xl">
          {visibleBoard.boardName}
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-[var(--color-foreground-muted)]">
          Table-first board with groups, items, column values, inline edits, and search.
        </p>
      </header>

      <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-soft)]">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <Input
            aria-label="Search items"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search items by name"
            className="max-w-md"
          />

          <div className="flex gap-2">
            <Input
              aria-label="New group name"
              value={groupNameDraft}
              onChange={(event) => setGroupNameDraft(event.target.value)}
              placeholder="New group name"
              className="w-48"
            />
            <Button onClick={() => void createGroup()}>Add Group</Button>
          </div>
        </div>

        {errorMessage && <p className="mt-3 text-sm text-rose-400">{errorMessage}</p>}
      </section>

      <div className="space-y-4">
        {visibleBoard.groups.map((group) => (
          <section
            key={group.id}
            className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-soft)]"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface-strong)] px-4 py-3">
              <button
                type="button"
                className="text-left text-sm font-semibold text-[var(--color-foreground)]"
                onClick={() => {
                  void updateGroup(group.id, {
                    isCollapsed: !group.isCollapsed,
                  });
                }}
              >
                {group.isCollapsed ? "▶" : "▼"} {group.name}
              </button>

              <Button variant="secondary" onClick={() => void createItem(group.id)}>
                Add Item
              </Button>
            </div>

            {!group.isCollapsed && (
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse">
                  <thead className="sticky top-0 z-20 bg-[var(--color-surface)]">
                    <tr>
                      <th className="sticky left-0 z-30 border-b border-r border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-left text-xs uppercase tracking-[0.12em] text-[var(--color-foreground-subtle)]">
                        Item
                      </th>
                      {visibleBoard.columns.map((column) => (
                        <th
                          key={column.id}
                          className="border-b border-[var(--color-border)] px-3 py-2 text-left text-xs uppercase tracking-[0.12em] text-[var(--color-foreground-subtle)]"
                        >
                          {column.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {group.items.map((item) => (
                      <tr key={item.id} className="border-b border-[var(--color-border)] last:border-b-0">
                        <td className="sticky left-0 z-10 bg-[var(--color-surface)] px-3 py-2">
                          <EditableTextCell
                            ariaLabel={`Item name ${item.name}`}
                            value={item.name}
                            onCommit={async (nextValue) => {
                              await updateItemName(item.id, nextValue);
                            }}
                          />
                        </td>
                        {visibleBoard.columns.map((column) => (
                          <td key={`${item.id}:${column.id}`} className="px-3 py-2 align-top">
                            {renderCell(item, column, visibleBoard, updateCell)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>

                {group.items.length === 0 && (
                  <div className="px-4 py-6 text-sm text-[var(--color-foreground-muted)]">
                    No items in this group yet.
                  </div>
                )}
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
