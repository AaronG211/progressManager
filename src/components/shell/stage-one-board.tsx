"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getSupabaseBrowserClient } from "@/lib/auth/supabase/browser";
import { getTelemetryClient } from "@/lib/observability";
import { flattenVisibleRows, hasNoSearchResults } from "@/lib/stage1/board-view";
import { reorderColumnsById } from "@/lib/stage1/columns";
import { getNextGridPosition, isGridArrowKey, type GridArrowKey } from "@/lib/stage1/grid-navigation";
import { filterBoardSnapshotByItemName, getStatusOptions } from "@/lib/stage1/search";
import { getVirtualWindow } from "@/lib/stage1/virtualization";
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
import { useEffect, useMemo, useRef, useState } from "react";

const telemetry = getTelemetryClient();
const VIRTUALIZATION_ROW_THRESHOLD = 200;
const VIRTUALIZATION_ROW_HEIGHT = 52;
const VIRTUALIZATION_OVERSCAN = 8;
const VIRTUALIZATION_VIEWPORT_HEIGHT = 480;

type ArrowNavigationContext = {
  rowIndex: number;
  columnIndex: number;
  onArrowKey: (rowIndex: number, columnIndex: number, key: GridArrowKey) => void;
};

type EditableTextCellProps = {
  value: string;
  ariaLabel: string;
  allowEmpty?: boolean;
  navigation: ArrowNavigationContext;
  onCommit: (nextValue: string) => Promise<void>;
};

function EditableTextCell({
  value,
  ariaLabel,
  allowEmpty = false,
  navigation,
  onCommit,
}: EditableTextCellProps) {
  const [draft, setDraft] = useState(value);
  const [isEditing, setIsEditing] = useState(false);
  const viewRef = useRef<HTMLButtonElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    if (!isEditing) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [isEditing]);

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

  const finishEditing = (restoreFocus: boolean) => {
    setIsEditing(false);

    if (!restoreFocus) {
      return;
    }

    window.requestAnimationFrame(() => {
      viewRef.current?.focus();
    });
  };

  if (!isEditing) {
    return (
      <button
        ref={viewRef}
        type="button"
        data-grid-row={navigation.rowIndex}
        data-grid-col={navigation.columnIndex}
        aria-label={ariaLabel}
        className="h-9 min-w-[160px] w-full rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 text-left text-sm text-[var(--color-foreground)] outline-none transition focus:border-[var(--color-brand-500)] focus:ring-2 focus:ring-[var(--color-brand-200)]"
        onClick={() => {
          setDraft(value);
          setIsEditing(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            setDraft(value);
            setIsEditing(true);
            return;
          }

          if (!isGridArrowKey(event.key)) {
            return;
          }

          event.preventDefault();
          navigation.onArrowKey(navigation.rowIndex, navigation.columnIndex, event.key);
        }}
      >
        {value || " "}
      </button>
    );
  }

  return (
    <Input
      ref={inputRef}
      data-grid-row={navigation.rowIndex}
      data-grid-col={navigation.columnIndex}
      aria-label={ariaLabel}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        void (async () => {
          await commit();
          finishEditing(true);
        })();
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          void (async () => {
            await commit();
            finishEditing(true);
          })();
          event.currentTarget.blur();
        }

        if (event.key === "Escape") {
          event.preventDefault();
          setDraft(value);
          finishEditing(true);
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
  navigation: ArrowNavigationContext,
  onUpdateCell: (
    itemId: string,
    column: StageOneColumn,
    value: string | null,
  ) => Promise<void>,
) {
  const value = getCell(item, column.id)?.statusValue ?? "";

  return (
    <select
      data-grid-row={navigation.rowIndex}
      data-grid-col={navigation.columnIndex}
      value={value}
      className="h-9 min-w-[150px] rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-sm"
      onChange={(event) => {
        void onUpdateCell(item.id, column, event.target.value || null);
      }}
      onKeyDown={(event) => {
        if (!isGridArrowKey(event.key)) {
          return;
        }

        event.preventDefault();
        navigation.onArrowKey(navigation.rowIndex, navigation.columnIndex, event.key);
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
  navigation: ArrowNavigationContext,
  onUpdateCell: (
    itemId: string,
    column: StageOneColumn,
    value: string | null,
  ) => Promise<void>,
) {
  const value = getCell(item, column.id)?.personId ?? "";

  return (
    <select
      data-grid-row={navigation.rowIndex}
      data-grid-col={navigation.columnIndex}
      value={value}
      className="h-9 min-w-[150px] rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-sm"
      onChange={(event) => {
        void onUpdateCell(item.id, column, event.target.value || null);
      }}
      onKeyDown={(event) => {
        if (!isGridArrowKey(event.key)) {
          return;
        }

        event.preventDefault();
        navigation.onArrowKey(navigation.rowIndex, navigation.columnIndex, event.key);
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
  navigation: ArrowNavigationContext,
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
      data-grid-row={navigation.rowIndex}
      data-grid-col={navigation.columnIndex}
      type="date"
      className="h-9 min-w-[150px]"
      value={value}
      onChange={(event) => {
        void onUpdateCell(item.id, column, event.target.value || null);
      }}
      onKeyDown={(event) => {
        if (!isGridArrowKey(event.key)) {
          return;
        }

        event.preventDefault();
        navigation.onArrowKey(navigation.rowIndex, navigation.columnIndex, event.key);
      }}
    />
  );
}

function renderCell(
  item: StageOneItem,
  column: StageOneColumn,
  board: StageOneBoardSnapshot,
  navigation: ArrowNavigationContext,
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
        navigation={navigation}
        onCommit={async (nextValue) => {
          await onUpdateCell(item.id, column, nextValue);
        }}
      />
    );
  }

  if (column.type === "STATUS") {
    const options = getStatusOptions(column.settings?.options);
    return renderStatusSelect(item, column, options, navigation, onUpdateCell);
  }

  if (column.type === "PERSON") {
    return renderPersonSelect(item, column, board, navigation, onUpdateCell);
  }

  return renderDateInput(item, column, navigation, onUpdateCell);
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
  const groupScrollContainerRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [board, setBoard] = useState<StageOneBoardSnapshot | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [creatingItemGroupId, setCreatingItemGroupId] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [search, setSearch] = useState("");
  const [groupNameDraft, setGroupNameDraft] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [draggingColumnId, setDraggingColumnId] = useState<string | null>(null);
  const [groupScrollTopById, setGroupScrollTopById] = useState<Record<string, number>>({});

  useEffect(() => {
    let mounted = true;

    async function loadBoard(): Promise<void> {
      setIsLoading(true);

      try {
        const snapshot = await apiRequest<StageOneBoardSnapshot>("/api/boards/bootstrap");

        if (!mounted) {
          return;
        }

        setErrorMessage(null);
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
  }, [router, reloadNonce]);

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

  const renderedRows = useMemo(() => {
    if (!visibleBoard) {
      return [] as StageOneItem[];
    }

    return flattenVisibleRows(visibleBoard.groups);
  }, [visibleBoard]);

  const rowIndexByItemId = useMemo(() => {
    const map = new Map<string, number>();

    renderedRows.forEach((item, index) => {
      map.set(item.id, index);
    });

    return map;
  }, [renderedRows]);

  const rowLocationByIndex = useMemo(() => {
    const map = new Map<number, { groupId: string; indexInGroup: number }>();

    if (!visibleBoard) {
      return map;
    }

    let currentRowIndex = 0;

    for (const group of visibleBoard.groups) {
      if (group.isCollapsed) {
        continue;
      }

      group.items.forEach((_, indexInGroup) => {
        map.set(currentRowIndex, {
          groupId: group.id,
          indexInGroup,
        });
        currentRowIndex += 1;
      });
    }

    return map;
  }, [visibleBoard]);

  const totalGridRows = renderedRows.length;
  const totalGridColumns = (visibleBoard?.columns.length ?? 0) + 1;

  const handleArrowNavigation = (rowIndex: number, columnIndex: number, key: GridArrowKey) => {
    const next = getNextGridPosition(
      { row: rowIndex, col: columnIndex },
      key,
      totalGridRows,
      totalGridColumns,
    );

    if (!next) {
      return;
    }

    const target = document.querySelector<HTMLElement>(
      `[data-grid-row="${next.row}"][data-grid-col="${next.col}"]`,
    );

    if (target) {
      target.focus();
      return;
    }

    const rowLocation = rowLocationByIndex.get(next.row);

    if (!rowLocation) {
      return;
    }

    const container = groupScrollContainerRefs.current[rowLocation.groupId];

    if (!container) {
      return;
    }

    container.scrollTop = Math.max(
      0,
      rowLocation.indexInGroup * VIRTUALIZATION_ROW_HEIGHT - VIRTUALIZATION_ROW_HEIGHT,
    );

    window.requestAnimationFrame(() => {
      const delayedTarget = document.querySelector<HTMLElement>(
        `[data-grid-row="${next.row}"][data-grid-col="${next.col}"]`,
      );
      delayedTarget?.focus();
    });
  };

  const reorderColumns = async (movingColumnId: string, targetColumnId: string) => {
    if (!board) {
      return;
    }

    const reorderedColumns = reorderColumnsById(board.columns, movingColumnId, targetColumnId);

    if (reorderedColumns === board.columns) {
      return;
    }

    const previous = board;

    setBoard({
      ...board,
      columns: reorderedColumns,
    });

    try {
      await apiRequest(`/api/boards/${board.boardId}/columns/reorder`, {
        method: "PATCH",
        body: JSON.stringify({
          columnIds: reorderedColumns.map((column) => column.id),
        }),
      });
      setErrorMessage(null);
      telemetry.track("stage1_columns_reordered_client", {
        boardId: board.boardId,
        sourceColumnId: movingColumnId,
        targetColumnId,
      });
    } catch (error: unknown) {
      setBoard(previous);
      setErrorMessage(error instanceof Error ? error.message : "Unable to reorder columns");
    }
  };

  const exportCsv = async () => {
    if (!board || isExporting) {
      return;
    }

    setIsExporting(true);

    try {
      const response = await fetch(`/api/boards/${board.boardId}/export/csv`, {
        method: "GET",
      });

      if (response.status === 401) {
        router.replace("/login");
        return;
      }

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(payload?.message || "Unable to export board CSV");
      }

      const blob = await response.blob();
      const objectUrl = window.URL.createObjectURL(blob);
      const contentDisposition = response.headers.get("Content-Disposition") || "";
      const filenameMatch = contentDisposition.match(/filename=\"?([^\";]+)\"?/i);
      const filename = filenameMatch?.[1] || "board-export.csv";
      const link = document.createElement("a");

      link.href = objectUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(objectUrl);
      setErrorMessage(null);

      telemetry.track("stage1_csv_exported_client", {
        boardId: board.boardId,
      });
    } catch (error: unknown) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to export board CSV");
    } finally {
      setIsExporting(false);
    }
  };

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
    if (!board || isCreatingGroup) {
      return;
    }

    const normalizedName = groupNameDraft.trim();

    if (!normalizedName) {
      return;
    }

    setIsCreatingGroup(true);

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
    } finally {
      setIsCreatingGroup(false);
    }
  };

  const createItem = async (groupId: string) => {
    if (!board || creatingItemGroupId === groupId) {
      return;
    }

    setCreatingItemGroupId(groupId);

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
    } finally {
      setCreatingItemGroupId((current) => (current === groupId ? null : current));
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
      <div className="mx-auto flex min-h-screen w-full max-w-6xl items-center justify-center px-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <p className="text-sm text-rose-400">{errorMessage || "Unable to load board"}</p>
          <Button
            variant="secondary"
            onClick={() => {
              setReloadNonce((current) => current + 1);
            }}
          >
            Retry
          </Button>
        </div>
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

          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => void exportCsv()} loading={isExporting}>
              Export CSV
            </Button>
            <Input
              aria-label="New group name"
              value={groupNameDraft}
              onChange={(event) => setGroupNameDraft(event.target.value)}
              placeholder="New group name"
              className="w-48"
              disabled={isCreatingGroup}
            />
            <Button onClick={() => void createGroup()} loading={isCreatingGroup}>
              Add Group
            </Button>
          </div>
        </div>

        {errorMessage && <p className="mt-3 text-sm text-rose-400">{errorMessage}</p>}
      </section>

      {hasNoSearchResults(visibleBoard.groups, search) && (
        <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-center shadow-[var(--shadow-soft)]">
          <p className="text-sm text-[var(--color-foreground-muted)]">
            No items matched &quot;{search.trim()}&quot;.
          </p>
          <div className="mt-3">
            <Button
              variant="secondary"
              onClick={() => {
                setSearch("");
              }}
            >
              Clear Search
            </Button>
          </div>
        </section>
      )}

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

              <Button
                variant="secondary"
                onClick={() => void createItem(group.id)}
                loading={creatingItemGroupId === group.id}
              >
                Add Item
              </Button>
            </div>

            {!group.isCollapsed && (
              <div
                ref={(node) => {
                  groupScrollContainerRefs.current[group.id] = node;
                }}
                className={group.items.length > VIRTUALIZATION_ROW_THRESHOLD ? "max-h-[480px] overflow-auto" : "overflow-x-auto"}
                onScroll={(event) => {
                  if (group.items.length <= VIRTUALIZATION_ROW_THRESHOLD) {
                    return;
                  }

                  const nextScrollTop = event.currentTarget.scrollTop;

                  setGroupScrollTopById((current) => {
                    if (current[group.id] === nextScrollTop) {
                      return current;
                    }

                    return {
                      ...current,
                      [group.id]: nextScrollTop,
                    };
                  });
                }}
              >
                <table className="min-w-full border-collapse">
                  <thead className="sticky top-0 z-20 bg-[var(--color-surface)]">
                    <tr>
                      <th className="sticky left-0 z-30 border-b border-r border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-left text-xs uppercase tracking-[0.12em] text-[var(--color-foreground-subtle)]">
                        Item
                      </th>
                      {visibleBoard.columns.map((column) => (
                        <th
                          key={column.id}
                          draggable
                          className={`border-b border-[var(--color-border)] px-3 py-2 text-left text-xs uppercase tracking-[0.12em] text-[var(--color-foreground-subtle)] ${
                            draggingColumnId === column.id ? "opacity-60" : ""
                          }`}
                          onDragStart={(event) => {
                            event.dataTransfer.effectAllowed = "move";
                            event.dataTransfer.setData("text/plain", column.id);
                            setDraggingColumnId(column.id);
                          }}
                          onDragOver={(event) => {
                            event.preventDefault();
                            event.dataTransfer.dropEffect = "move";
                          }}
                          onDrop={(event) => {
                            event.preventDefault();
                            const movingColumnId = draggingColumnId || event.dataTransfer.getData("text/plain");

                            setDraggingColumnId(null);

                            if (!movingColumnId || movingColumnId === column.id) {
                              return;
                            }

                            void reorderColumns(movingColumnId, column.id);
                          }}
                          onDragEnd={() => {
                            setDraggingColumnId(null);
                          }}
                        >
                          {column.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const shouldVirtualize = group.items.length > VIRTUALIZATION_ROW_THRESHOLD;
                      const scrollTop = groupScrollTopById[group.id] ?? 0;
                      const windowedRange = shouldVirtualize
                        ? getVirtualWindow({
                            totalCount: group.items.length,
                            scrollTop,
                            viewportHeight: VIRTUALIZATION_VIEWPORT_HEIGHT,
                            rowHeight: VIRTUALIZATION_ROW_HEIGHT,
                            overscan: VIRTUALIZATION_OVERSCAN,
                          })
                        : null;
                      const visibleItems = shouldVirtualize && windowedRange
                        ? group.items.slice(windowedRange.startIndex, windowedRange.endIndex + 1)
                        : group.items;

                      return (
                        <>
                          {shouldVirtualize && windowedRange && windowedRange.topSpacerHeight > 0 && (
                            <tr aria-hidden="true">
                              <td
                                colSpan={visibleBoard.columns.length + 1}
                                style={{ height: `${windowedRange.topSpacerHeight}px`, padding: 0, border: 0 }}
                              />
                            </tr>
                          )}

                          {visibleItems.map((item) => {
                            const rowIndex = rowIndexByItemId.get(item.id) ?? 0;

                            return (
                              <tr key={item.id} className="border-b border-[var(--color-border)] last:border-b-0">
                                <td className="sticky left-0 z-10 bg-[var(--color-surface)] px-3 py-2">
                                  <EditableTextCell
                                    ariaLabel={`Item name ${item.name}`}
                                    value={item.name}
                                    navigation={{
                                      rowIndex,
                                      columnIndex: 0,
                                      onArrowKey: handleArrowNavigation,
                                    }}
                                    onCommit={async (nextValue) => {
                                      await updateItemName(item.id, nextValue);
                                    }}
                                  />
                                </td>
                                {visibleBoard.columns.map((column, index) => (
                                  <td key={`${item.id}:${column.id}`} className="px-3 py-2 align-top">
                                    {renderCell(item, column, visibleBoard, {
                                      rowIndex,
                                      columnIndex: index + 1,
                                      onArrowKey: handleArrowNavigation,
                                    }, updateCell)}
                                  </td>
                                ))}
                              </tr>
                            );
                          })}

                          {shouldVirtualize && windowedRange && windowedRange.bottomSpacerHeight > 0 && (
                            <tr aria-hidden="true">
                              <td
                                colSpan={visibleBoard.columns.length + 1}
                                style={{ height: `${windowedRange.bottomSpacerHeight}px`, padding: 0, border: 0 }}
                              />
                            </tr>
                          )}
                        </>
                      );
                    })()}
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
