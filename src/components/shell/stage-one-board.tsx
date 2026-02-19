"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getSupabaseBrowserClient } from "@/lib/auth/supabase/browser";
import { getTelemetryClient } from "@/lib/observability";
import { flattenVisibleRows } from "@/lib/stage1/board-view";
import { reorderColumnsById } from "@/lib/stage1/columns";
import { getNextGridPosition, isGridArrowKey, type GridArrowKey } from "@/lib/stage1/grid-navigation";
import { filterBoardSnapshotByItemName, getStatusOptions } from "@/lib/stage1/search";
import { getVirtualWindow } from "@/lib/stage1/virtualization";
import {
  applyBoardViewConfig,
  buildTimelineEntries,
  buildKanbanLanes,
  getDateColumns,
  getDateColumnId,
} from "@/lib/stage3/view-framework";
import {
  buildPagedBootstrapPath,
  mergePagedSnapshot,
  normalizeBootstrapResponse,
  type BoardBootstrapEnvelope,
  type BoardPaginationState,
} from "@/lib/stage3/client-pagination";
import type {
  BoardShareSettingsSummary,
  WorkspaceNotificationSummary,
} from "@/lib/stage2/types";
import type {
  StageBoardView,
  StageBoardViewConfig,
  StageBoardViewType,
  StageOneBoardSnapshot,
  StageOneCellValue,
  StageOneColumn,
  StageOneColumnType,
  StageOneGroup,
  StageOneItem,
  StageOneStatusOption,
} from "@/lib/stage1/types";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const telemetry = getTelemetryClient();
const VIRTUALIZATION_ROW_THRESHOLD = 200;
const VIRTUALIZATION_ROW_HEIGHT = 52;
const VIRTUALIZATION_OVERSCAN = 8;
const VIRTUALIZATION_VIEWPORT_HEIGHT = 480;
const SERVER_PAGE_SIZE = 300;

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

function getMemberLabel(board: StageOneBoardSnapshot, userId: string | null): string {
  if (!userId) {
    return "Unassigned";
  }

  const member = board.members.find((current) => current.userId === userId);
  return member ? member.name || member.email : "Unknown";
}

function formatDateValue(value: string | null): string {
  if (!value) {
    return "No date";
  }

  return value.slice(0, 10);
}

function renderReadonlyCellValue(value: string) {
  return (
    <div className="flex min-h-9 min-w-[150px] items-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-foreground-muted)]">
      {value}
    </div>
  );
}

function getLastEditedByLabel(item: StageOneItem, board: StageOneBoardSnapshot): string {
  if (!item.lastEditedById) {
    return "Not edited yet";
  }

  const member = board.members.find((candidate) => candidate.userId === item.lastEditedById);
  return member ? `Last edited by ${member.name || member.email}` : "Last edited by Unknown";
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

type UpdateItemResponse = {
  id: string;
  name: string;
  lastEditedById: string | null;
};

type UpdateCellResponse = StageOneCellValue & {
  itemLastEditedById: string | null;
};

type CellUpdateValue = string | number | boolean | string[] | null;

type UpdateCellMutationPayload = {
  textValue?: string | null;
  statusValue?: string | null;
  personId?: string | null;
  dateValue?: string | null;
  numberValue?: number | null;
  tagsValue?: string[] | null;
  checkboxValue?: boolean | null;
  urlValue?: string | null;
};

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

function formatTimelineDateLabel(startDateValue: string | null, endDateValue: string | null): string {
  if (!startDateValue && !endDateValue) {
    return "No date";
  }

  if (!startDateValue || !endDateValue) {
    const fallback = startDateValue ?? endDateValue;
    return fallback ? fallback.slice(0, 10) : "No date";
  }

  const startLabel = startDateValue.slice(0, 10);
  const endLabel = endDateValue.slice(0, 10);

  if (startLabel === endLabel) {
    return startLabel;
  }

  return `${startLabel} -> ${endLabel}`;
}

function renderStatusSelect(
  item: StageOneItem,
  column: StageOneColumn,
  options: StageOneStatusOption[],
  navigation: ArrowNavigationContext,
  onUpdateCell: (
    itemId: string,
    column: StageOneColumn,
    value: CellUpdateValue,
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
    value: CellUpdateValue,
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
    value: CellUpdateValue,
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

function renderNumberInput(
  item: StageOneItem,
  column: StageOneColumn,
  navigation: ArrowNavigationContext,
  onUpdateCell: (
    itemId: string,
    column: StageOneColumn,
    value: CellUpdateValue,
  ) => Promise<void>,
) {
  const numberValue = getCell(item, column.id)?.numberValue;

  return (
    <EditableTextCell
      ariaLabel={`${column.name} for ${item.name}`}
      value={numberValue === null || numberValue === undefined ? "" : String(numberValue)}
      allowEmpty
      navigation={navigation}
      onCommit={async (nextValue) => {
        const normalized = nextValue.trim();

        if (!normalized) {
          await onUpdateCell(item.id, column, null);
          return;
        }

        const parsed = Number(normalized);

        if (!Number.isFinite(parsed)) {
          return;
        }

        await onUpdateCell(item.id, column, parsed);
      }}
    />
  );
}

function parseTagsInput(rawValue: string): string[] | null {
  const tags = Array.from(
    new Set(
      rawValue
        .split(",")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0),
    ),
  );

  return tags.length > 0 ? tags : null;
}

function renderTagsInput(
  item: StageOneItem,
  column: StageOneColumn,
  navigation: ArrowNavigationContext,
  onUpdateCell: (
    itemId: string,
    column: StageOneColumn,
    value: CellUpdateValue,
  ) => Promise<void>,
) {
  const tags = getCell(item, column.id)?.tagsValue ?? [];

  return (
    <EditableTextCell
      ariaLabel={`${column.name} for ${item.name}`}
      value={tags.join(", ")}
      allowEmpty
      navigation={navigation}
      onCommit={async (nextValue) => {
        await onUpdateCell(item.id, column, parseTagsInput(nextValue));
      }}
    />
  );
}

function renderCheckboxInput(
  item: StageOneItem,
  column: StageOneColumn,
  navigation: ArrowNavigationContext,
  onUpdateCell: (
    itemId: string,
    column: StageOneColumn,
    value: CellUpdateValue,
  ) => Promise<void>,
) {
  const checked = getCell(item, column.id)?.checkboxValue ?? false;

  return (
    <label className="inline-flex h-9 min-w-[120px] items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm">
      <input
        data-grid-row={navigation.rowIndex}
        data-grid-col={navigation.columnIndex}
        type="checkbox"
        checked={checked}
        className="size-4"
        onChange={(event) => {
          void onUpdateCell(item.id, column, event.target.checked);
        }}
        onKeyDown={(event) => {
          if (!isGridArrowKey(event.key)) {
            return;
          }

          event.preventDefault();
          navigation.onArrowKey(navigation.rowIndex, navigation.columnIndex, event.key);
        }}
      />
      <span>{checked ? "Checked" : "Unchecked"}</span>
    </label>
  );
}

function renderUrlInput(
  item: StageOneItem,
  column: StageOneColumn,
  navigation: ArrowNavigationContext,
  onUpdateCell: (
    itemId: string,
    column: StageOneColumn,
    value: CellUpdateValue,
  ) => Promise<void>,
) {
  const urlValue = getCell(item, column.id)?.urlValue ?? "";

  return (
    <EditableTextCell
      ariaLabel={`${column.name} for ${item.name}`}
      value={urlValue}
      allowEmpty
      navigation={navigation}
      onCommit={async (nextValue) => {
        const normalized = nextValue.trim();
        await onUpdateCell(item.id, column, normalized || null);
      }}
    />
  );
}

function renderCell(
  item: StageOneItem,
  column: StageOneColumn,
  board: StageOneBoardSnapshot,
  isReadonly: boolean,
  navigation: ArrowNavigationContext,
  onUpdateCell: (
    itemId: string,
    column: StageOneColumn,
    value: CellUpdateValue,
  ) => Promise<void>,
) {
  const cell = getCell(item, column.id);

  if (isReadonly) {
    if (column.type === "TEXT") {
      return renderReadonlyCellValue(cell?.textValue ?? "");
    }

    if (column.type === "STATUS") {
      return renderReadonlyCellValue(cell?.statusValue ?? "Unassigned");
    }

    if (column.type === "PERSON") {
      return renderReadonlyCellValue(getMemberLabel(board, cell?.personId ?? null));
    }

    if (column.type === "DATE") {
      return renderReadonlyCellValue(formatDateValue(cell?.dateValue ?? null));
    }

    if (column.type === "NUMBER") {
      return renderReadonlyCellValue(
        cell?.numberValue === null || cell?.numberValue === undefined ? "" : String(cell.numberValue),
      );
    }

    if (column.type === "TAGS") {
      return renderReadonlyCellValue(cell?.tagsValue?.join(", ") ?? "");
    }

    if (column.type === "CHECKBOX") {
      if (cell?.checkboxValue === null || cell?.checkboxValue === undefined) {
        return renderReadonlyCellValue("");
      }

      return renderReadonlyCellValue(cell.checkboxValue ? "Checked" : "Unchecked");
    }

    return renderReadonlyCellValue(cell?.urlValue ?? "");
  }

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

  if (column.type === "DATE") {
    return renderDateInput(item, column, navigation, onUpdateCell);
  }

  if (column.type === "NUMBER") {
    return renderNumberInput(item, column, navigation, onUpdateCell);
  }

  if (column.type === "TAGS") {
    return renderTagsInput(item, column, navigation, onUpdateCell);
  }

  if (column.type === "CHECKBOX") {
    return renderCheckboxInput(item, column, navigation, onUpdateCell);
  }

  return renderUrlInput(item, column, navigation, onUpdateCell);
}

function emptyValueForColumnType(columnType: StageOneColumnType): Pick<
  StageOneCellValue,
  | "textValue"
  | "statusValue"
  | "personId"
  | "dateValue"
  | "numberValue"
  | "tagsValue"
  | "checkboxValue"
  | "urlValue"
> {
  const base = {
    textValue: null,
    statusValue: null,
    personId: null,
    dateValue: null,
    numberValue: null,
    tagsValue: null,
    checkboxValue: null,
    urlValue: null,
  };

  if (columnType === "TEXT") {
    return {
      ...base,
      textValue: "",
    };
  }

  return base;
}

type StageOneBoardProps = {
  userLabel: string;
  bootstrapPath?: string;
  readOnly?: boolean;
  hideSignOut?: boolean;
};

type InviteRoleOption = "ADMIN" | "MEMBER" | "VIEWER";

export function StageOneBoard({
  userLabel,
  bootstrapPath = "/api/boards/bootstrap",
  readOnly = false,
  hideSignOut = false,
}: StageOneBoardProps) {
  const router = useRouter();
  const groupScrollContainerRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [board, setBoard] = useState<StageOneBoardSnapshot | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [viewConfigDraft, setViewConfigDraft] = useState<StageBoardViewConfig>({});
  const [isSavingViewConfig, setIsSavingViewConfig] = useState(false);
  const [viewConfigMessage, setViewConfigMessage] = useState<string | null>(null);
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [creatingItemGroupId, setCreatingItemGroupId] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [search, setSearch] = useState("");
  const [groupNameDraft, setGroupNameDraft] = useState("");
  const [inviteEmailDraft, setInviteEmailDraft] = useState("");
  const [inviteRoleDraft, setInviteRoleDraft] = useState<InviteRoleOption>("MEMBER");
  const [isInvitingMember, setIsInvitingMember] = useState(false);
  const [inviteStatusMessage, setInviteStatusMessage] = useState<string | null>(null);
  const [latestInviteLink, setLatestInviteLink] = useState<string | null>(null);
  const [boardShareSettings, setBoardShareSettings] = useState<BoardShareSettingsSummary | null>(
    null,
  );
  const [isLoadingShareSettings, setIsLoadingShareSettings] = useState(false);
  const [isUpdatingShareSettings, setIsUpdatingShareSettings] = useState(false);
  const [shareSettingsMessage, setShareSettingsMessage] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<WorkspaceNotificationSummary[]>([]);
  const [isLoadingNotifications, setIsLoadingNotifications] = useState(false);
  const [notificationErrorMessage, setNotificationErrorMessage] = useState<string | null>(null);
  const [markingNotificationId, setMarkingNotificationId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [draggingColumnId, setDraggingColumnId] = useState<string | null>(null);
  const [groupScrollTopById, setGroupScrollTopById] = useState<Record<string, number>>({});
  const [serverPagination, setServerPagination] = useState<BoardPaginationState | null>(null);
  const [isLoadingMoreItems, setIsLoadingMoreItems] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function loadBoard(): Promise<void> {
      setIsLoading(true);
      setBoardShareSettings(null);
      setShareSettingsMessage(null);
      setNotifications([]);
      setNotificationErrorMessage(null);
      setServerPagination(null);
      setIsLoadingMoreItems(false);

      try {
        const payload = await apiRequest<StageOneBoardSnapshot | BoardBootstrapEnvelope>(
          buildPagedBootstrapPath(bootstrapPath, {
            itemOffset: 0,
            itemLimit: SERVER_PAGE_SIZE,
          }),
        );
        const { snapshot, pagination } = normalizeBootstrapResponse(payload);

        if (!mounted) {
          return;
        }

        setErrorMessage(null);
        setBoard(snapshot);
        setServerPagination(pagination);
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
  }, [bootstrapPath, router, reloadNonce]);

  useEffect(() => {
    let mounted = true;
    const boardId = board?.boardId;

    async function loadShareSettings(): Promise<void> {
      if (!boardId || readOnly) {
        return;
      }

      setIsLoadingShareSettings(true);

      try {
        const settings = await apiRequest<BoardShareSettingsSummary>(`/api/boards/${boardId}/share`);

        if (!mounted) {
          return;
        }

        setBoardShareSettings(settings);
      } catch (error: unknown) {
        if (!mounted) {
          return;
        }

        if (error instanceof ApiError && error.status === 401) {
          router.replace("/login");
          return;
        }

        const message =
          error instanceof Error ? error.message : "Unable to load board sharing settings";
        setShareSettingsMessage(message);
      } finally {
        if (mounted) {
          setIsLoadingShareSettings(false);
        }
      }
    }

    void loadShareSettings();

    return () => {
      mounted = false;
    };
  }, [board?.boardId, readOnly, router]);

  const signOut = async (): Promise<void> => {
    const supabase = getSupabaseBrowserClient();

    if (supabase) {
      await supabase.auth.signOut();
    }

    router.replace("/login");
    router.refresh();
  };

  const loadNotifications = useCallback(async () => {
    if (readOnly) {
      return;
    }

    setIsLoadingNotifications(true);

    try {
      const payload = await apiRequest<{ notifications: WorkspaceNotificationSummary[] }>(
        "/api/notifications?limit=12",
      );
      setNotifications(payload.notifications);
      setNotificationErrorMessage(null);
    } catch (error: unknown) {
      if (error instanceof ApiError && error.status === 401) {
        router.replace("/login");
        return;
      }

      const message = error instanceof Error ? error.message : "Unable to load notifications";
      setNotificationErrorMessage(message);
    } finally {
      setIsLoadingNotifications(false);
    }
  }, [readOnly, router]);

  const markNotificationRead = async (notificationId: string) => {
    if (readOnly || markingNotificationId) {
      return;
    }

    setMarkingNotificationId(notificationId);

    try {
      const payload = await apiRequest<{ id: string; readAt: string | null }>(
        `/api/notifications/${notificationId}`,
        {
          method: "PATCH",
          body: JSON.stringify({ read: true }),
        },
      );

      setNotifications((current) =>
        current.map((notification) =>
          notification.id === payload.id
            ? {
                ...notification,
                readAt: payload.readAt,
              }
            : notification,
        ),
      );
      setNotificationErrorMessage(null);
    } catch (error: unknown) {
      if (error instanceof ApiError && error.status === 401) {
        router.replace("/login");
        return;
      }

      const message = error instanceof Error ? error.message : "Unable to mark notification";
      setNotificationErrorMessage(message);
    } finally {
      setMarkingNotificationId(null);
    }
  };

  const loadMoreBoardItems = useCallback(async () => {
    if (!serverPagination?.hasMore || isLoadingMoreItems) {
      return;
    }

    setIsLoadingMoreItems(true);

    try {
      const payload = await apiRequest<StageOneBoardSnapshot | BoardBootstrapEnvelope>(
        buildPagedBootstrapPath(bootstrapPath, {
          itemOffset: serverPagination.nextOffset,
          itemLimit: serverPagination.itemLimit,
        }),
      );
      const { snapshot, pagination } = normalizeBootstrapResponse(payload);

      setBoard((current) => (current ? mergePagedSnapshot(current, snapshot) : snapshot));
      setServerPagination(pagination);
      setErrorMessage(null);
    } catch (error: unknown) {
      if (error instanceof ApiError && error.status === 401) {
        router.replace("/login");
        return;
      }

      const message = error instanceof Error ? error.message : "Unable to load more board items";
      setErrorMessage(message);
    } finally {
      setIsLoadingMoreItems(false);
    }
  }, [bootstrapPath, isLoadingMoreItems, router, serverPagination]);

  useEffect(() => {
    if (!board?.boardId || readOnly) {
      return;
    }

    void loadNotifications();
  }, [board?.boardId, loadNotifications, readOnly]);

  const boardViews = useMemo(() => board?.views ?? [], [board?.views]);
  const boardViewsSignature = useMemo(
    () => boardViews.map((view) => `${view.id}:${view.name}:${JSON.stringify(view.config ?? {})}`).join("|"),
    [boardViews],
  );

  useEffect(() => {
    if (boardViews.length === 0) {
      setActiveViewId(null);
      setViewConfigDraft({});
      return;
    }

    const activeView = boardViews.find((view) => view.id === activeViewId);

    if (!activeView) {
      const fallbackView = boardViews.find((view) => view.type === "TABLE") ?? boardViews[0];
      setActiveViewId(fallbackView.id);
      setViewConfigDraft(fallbackView.config ?? {});
      return;
    }

    setViewConfigDraft(activeView.config ?? {});
  }, [activeViewId, boardViews, boardViewsSignature]);

  const canWrite = readOnly ? false : (boardShareSettings?.canWrite ?? false);
  const canManage = readOnly ? false : (boardShareSettings?.canManage ?? false);
  const isReadonlyBoard = readOnly || !canWrite;
  const activeView = useMemo(
    () => (board ? board.views.find((view) => view.id === activeViewId) ?? null : null),
    [activeViewId, board],
  );
  const activeViewType: StageBoardViewType = activeView?.type ?? "TABLE";

  const visibleBoard = useMemo(() => {
    if (!board) {
      return null;
    }

    const searchedBoard = filterBoardSnapshotByItemName(board, search);
    return applyBoardViewConfig(searchedBoard, viewConfigDraft);
  }, [board, search, viewConfigDraft]);

  const statusColumn = useMemo(
    () => visibleBoard?.columns.find((column) => column.type === "STATUS") ?? null,
    [visibleBoard],
  );
  const dateColumns = useMemo(
    () => (visibleBoard ? getDateColumns(visibleBoard) : []),
    [visibleBoard],
  );
  const dateColumn = useMemo(
    () => dateColumns[0] ?? null,
    [dateColumns],
  );
  const numberColumn = useMemo(
    () => visibleBoard?.columns.find((column) => column.type === "NUMBER") ?? null,
    [visibleBoard],
  );
  const tagsColumn = useMemo(
    () => visibleBoard?.columns.find((column) => column.type === "TAGS") ?? null,
    [visibleBoard],
  );
  const checkboxColumn = useMemo(
    () => visibleBoard?.columns.find((column) => column.type === "CHECKBOX") ?? null,
    [visibleBoard],
  );
  const urlColumn = useMemo(
    () => visibleBoard?.columns.find((column) => column.type === "URL") ?? null,
    [visibleBoard],
  );
  const statusOptions = useMemo(
    () => getStatusOptions(statusColumn?.settings?.options),
    [statusColumn?.settings?.options],
  );
  const hasMoreServerItems = serverPagination?.hasMore ?? false;
  const kanbanLanes = useMemo(
    () => (visibleBoard ? buildKanbanLanes(visibleBoard) : []),
    [visibleBoard],
  );
  const dateColumnId = useMemo(
    () => (visibleBoard ? getDateColumnId(visibleBoard) : null),
    [visibleBoard],
  );
  const calendarEntries = useMemo(() => {
    if (!visibleBoard) {
      return [] as Array<{ item: StageOneItem; dateValue: string | null }>;
    }

    return flattenVisibleRows(visibleBoard.groups)
      .map((item) => ({
        item,
        dateValue: dateColumnId ? getCell(item, dateColumnId)?.dateValue ?? null : null,
      }))
      .sort((a, b) => {
        const aTime = a.dateValue ? new Date(a.dateValue).getTime() : Number.POSITIVE_INFINITY;
        const bTime = b.dateValue ? new Date(b.dateValue).getTime() : Number.POSITIVE_INFINITY;

        if (aTime === bTime) {
          return a.item.position - b.item.position;
        }

        return aTime - bTime;
      });
  }, [dateColumnId, visibleBoard]);
  const timelineData = useMemo(() => {
    if (!visibleBoard) {
      return {
        entries: [],
        startDateColumnId: null as string | null,
        endDateColumnId: null as string | null,
      };
    }

    return buildTimelineEntries(visibleBoard, {
      startDateColumnId: viewConfigDraft.timelineStartColumnId ?? null,
      endDateColumnId: viewConfigDraft.timelineEndColumnId ?? null,
    });
  }, [
    visibleBoard,
    viewConfigDraft.timelineStartColumnId,
    viewConfigDraft.timelineEndColumnId,
  ]);
  const timelineEntries = timelineData.entries;
  const timelineStartColumnId = timelineData.startDateColumnId;
  const timelineEndColumnId = timelineData.endDateColumnId;
  const timelineStartColumn = useMemo(
    () => dateColumns.find((column) => column.id === timelineStartColumnId) ?? null,
    [dateColumns, timelineStartColumnId],
  );
  const timelineEndColumn = useMemo(
    () => dateColumns.find((column) => column.id === timelineEndColumnId) ?? null,
    [dateColumns, timelineEndColumnId],
  );

  const renderedRows = useMemo(() => {
    if (!visibleBoard) {
      return [] as StageOneItem[];
    }

    return flattenVisibleRows(visibleBoard.groups);
  }, [visibleBoard]);
  const hasNoVisibleItems = renderedRows.length === 0;

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
    if (!board || isReadonlyBoard) {
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

  const updateBoardSharing = async (patch: { isPrivate?: boolean; shareLinkEnabled?: boolean }) => {
    if (!board || !canManage || isUpdatingShareSettings) {
      return;
    }

    setIsUpdatingShareSettings(true);
    setShareSettingsMessage(null);

    try {
      const nextSettings = await apiRequest<BoardShareSettingsSummary>(
        `/api/boards/${board.boardId}/share`,
        {
          method: "PATCH",
          body: JSON.stringify(patch),
        },
      );

      setBoardShareSettings(nextSettings);
      setShareSettingsMessage("Board sharing settings updated.");
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Unable to update board sharing settings";
      setShareSettingsMessage(message);
    } finally {
      setIsUpdatingShareSettings(false);
    }
  };

  const saveActiveViewConfig = async () => {
    if (!board || !activeView || readOnly || isSavingViewConfig) {
      return;
    }

    setIsSavingViewConfig(true);
    setViewConfigMessage(null);

    try {
      const updatedView = await apiRequest<StageBoardView>(
        `/api/boards/${board.boardId}/views/${activeView.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            config: viewConfigDraft,
          }),
        },
      );

      setBoard((current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          views: current.views.map((view) =>
            view.id === updatedView.id
              ? {
                  ...view,
                  ...updatedView,
                }
              : view,
          ),
        };
      });
      setViewConfigMessage("View config saved.");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unable to save view config";
      setViewConfigMessage(message);
    } finally {
      setIsSavingViewConfig(false);
    }
  };

  const updateGroup = async (groupId: string, patch: { name?: string; isCollapsed?: boolean }) => {
    if (!board || isReadonlyBoard) {
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
    if (!board || isCreatingGroup || isReadonlyBoard) {
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

  const createWorkspaceInvite = async () => {
    if (!board || isInvitingMember || !canManage) {
      return;
    }

    const normalizedEmail = inviteEmailDraft.trim().toLowerCase();

    if (!normalizedEmail) {
      setInviteStatusMessage("Please enter an email to invite.");
      return;
    }

    setIsInvitingMember(true);

    try {
      const response = await fetch(`/api/workspaces/${board.workspaceId}/invites`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: normalizedEmail,
          role: inviteRoleDraft,
        }),
      });

      if (response.status === 401) {
        router.replace("/login");
        return;
      }

      const payload = (await response.json().catch(() => null)) as
        | {
            message?: string;
            inviteUrl?: string;
          }
        | null;

      if (!response.ok) {
        throw new Error(payload?.message || "Unable to create invite");
      }

      setInviteEmailDraft("");
      setLatestInviteLink(payload?.inviteUrl ?? null);
      setInviteStatusMessage("Invite created. Share the link below with your teammate.");
    } catch (error: unknown) {
      setLatestInviteLink(null);
      setInviteStatusMessage(error instanceof Error ? error.message : "Unable to create invite");
    } finally {
      setIsInvitingMember(false);
    }
  };

  const createItem = async (groupId: string) => {
    if (!board || creatingItemGroupId === groupId || isReadonlyBoard) {
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
    if (!board || isReadonlyBoard) {
      return;
    }

    const previous = board;
    const optimistic = updateItemInBoard(board, itemId, (item) => ({
      ...item,
      name,
    }));

    setBoard(optimistic);

    try {
      const updatedItem = await apiRequest<UpdateItemResponse>(
        `/api/boards/${board.boardId}/items/${itemId}`,
        {
          method: "PATCH",
          body: JSON.stringify({ name }),
        },
      );

      setBoard((current) => {
        if (!current) {
          return current;
        }

        return updateItemInBoard(current, itemId, (item) => ({
          ...item,
          name: updatedItem.name,
          lastEditedById: updatedItem.lastEditedById,
        }));
      });
    } catch (error: unknown) {
      setBoard(previous);
      setErrorMessage(error instanceof Error ? error.message : "Unable to update item name");
    }
  };

  const updateCell = async (itemId: string, column: StageOneColumn, value: CellUpdateValue) => {
    if (!board || isReadonlyBoard) {
      return;
    }

    const previous = board;
    const payload: UpdateCellMutationPayload = {};

    if (column.type === "TEXT") {
      payload.textValue = typeof value === "string" ? value : "";
    }

    if (column.type === "STATUS") {
      payload.statusValue = typeof value === "string" ? value : null;
    }

    if (column.type === "PERSON") {
      payload.personId = typeof value === "string" ? value : null;
    }

    if (column.type === "DATE") {
      payload.dateValue = typeof value === "string" ? value : null;
    }

    if (column.type === "NUMBER") {
      payload.numberValue = typeof value === "number" ? value : null;
    }

    if (column.type === "TAGS") {
      payload.tagsValue = Array.isArray(value) ? value : null;
    }

    if (column.type === "CHECKBOX") {
      payload.checkboxValue = typeof value === "boolean" ? value : null;
    }

    if (column.type === "URL") {
      payload.urlValue = typeof value === "string" ? value : null;
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
        dateValue:
          column.type === "DATE"
            ? payload.dateValue
              ? new Date(payload.dateValue).toISOString()
              : null
            : existingCell?.dateValue ?? null,
        numberValue:
          column.type === "NUMBER" ? payload.numberValue ?? null : existingCell?.numberValue ?? null,
        tagsValue:
          column.type === "TAGS" ? payload.tagsValue ?? null : existingCell?.tagsValue ?? null,
        checkboxValue:
          column.type === "CHECKBOX"
            ? payload.checkboxValue ?? null
            : existingCell?.checkboxValue ?? null,
        urlValue: column.type === "URL" ? payload.urlValue ?? null : existingCell?.urlValue ?? null,
      });
    });

    setBoard(optimisticBoard);

    try {
      const updatedCell = await apiRequest<UpdateCellResponse>(
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

        return updateItemInBoard(current, itemId, (item) => ({
          ...upsertCellValue(item, updatedCell),
          lastEditedById: updatedCell.itemLastEditedById,
        }));
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
            Stage 3 Views
          </p>
          <div className="flex items-center gap-2 text-xs text-[var(--color-foreground-muted)]">
            <span className="rounded-md border border-[var(--color-border)] px-2 py-1">{userLabel}</span>
            {isReadonlyBoard && (
              <span className="rounded-md border border-[var(--color-border)] px-2 py-1">
                View only
              </span>
            )}
            {!hideSignOut && !readOnly && (
              <Button variant="neutral" className="h-8 px-3" onClick={() => void signOut()}>
                Sign out
              </Button>
            )}
          </div>
        </div>
        <h1 className="mt-2 text-2xl font-semibold text-[var(--color-foreground)] md:text-3xl">
          {visibleBoard.boardName}
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-[var(--color-foreground-muted)]">
          Table-first board with groups, items, column values, inline edits, and search.
        </p>
      </header>

      {board.views.length > 0 && (
        <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-soft)]">
          <div className="flex flex-wrap gap-2">
            {board.views.map((view) => (
              <Button
                key={view.id}
                variant={activeViewId === view.id ? "primary" : "secondary"}
                className="h-9 px-3"
                onClick={() => {
                  setActiveViewId(view.id);
                  setViewConfigDraft(view.config ?? {});
                  setViewConfigMessage(null);
                }}
              >
                {view.name}
              </Button>
            ))}
          </div>
        </section>
      )}

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
            {!readOnly && (
              <Button variant="secondary" onClick={() => void exportCsv()} loading={isExporting}>
                Export CSV
              </Button>
            )}
            {canWrite && (
              <>
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
              </>
            )}
          </div>
        </div>

        {activeView && (
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
            <select
              aria-label="View status filter"
              className="h-10 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-sm"
              value={viewConfigDraft.statusValue ?? ""}
              onChange={(event) =>
                setViewConfigDraft((current) => ({
                  ...current,
                  statusValue: event.target.value || null,
                }))
              }
            >
              <option value="">All statuses</option>
              {statusOptions.map((option) => (
                <option key={option.label} value={option.label}>
                  {option.label}
                </option>
              ))}
            </select>

            <select
              aria-label="View owner filter"
              className="h-10 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-sm"
              value={viewConfigDraft.personId ?? ""}
              onChange={(event) =>
                setViewConfigDraft((current) => ({
                  ...current,
                  personId: event.target.value || null,
                }))
              }
            >
              <option value="">All owners</option>
              {board.members.map((member) => (
                <option key={member.userId} value={member.userId}>
                  {member.name || member.email}
                </option>
              ))}
            </select>

            <Input
              aria-label="View date from filter"
              type="date"
              value={viewConfigDraft.dateFrom ?? ""}
              onChange={(event) =>
                setViewConfigDraft((current) => ({
                  ...current,
                  dateFrom: event.target.value || null,
                }))
              }
            />

            <Input
              aria-label="View date to filter"
              type="date"
              value={viewConfigDraft.dateTo ?? ""}
              onChange={(event) =>
                setViewConfigDraft((current) => ({
                  ...current,
                  dateTo: event.target.value || null,
                }))
              }
            />

            {activeViewType === "TIMELINE" && dateColumns.length > 0 && (
              <select
                aria-label="Timeline start column"
                className="h-10 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-sm"
                value={timelineStartColumnId ?? ""}
                onChange={(event) =>
                  setViewConfigDraft((current) => {
                    const nextStart = event.target.value || null;
                    const nextEnd =
                      current.timelineEndColumnId &&
                      dateColumns.some((column) => column.id === current.timelineEndColumnId)
                        ? current.timelineEndColumnId
                        : nextStart;

                    return {
                      ...current,
                      timelineStartColumnId: nextStart,
                      timelineEndColumnId: nextEnd,
                    };
                  })
                }
              >
                <option value="">Timeline start date column</option>
                {dateColumns.map((column) => (
                  <option key={column.id} value={column.id}>
                    Start: {column.name}
                  </option>
                ))}
              </select>
            )}

            {activeViewType === "TIMELINE" && dateColumns.length > 0 && (
              <select
                aria-label="Timeline end column"
                className="h-10 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-sm"
                value={timelineEndColumnId ?? ""}
                onChange={(event) =>
                  setViewConfigDraft((current) => ({
                    ...current,
                    timelineEndColumnId: event.target.value || null,
                  }))
                }
              >
                <option value="">Timeline end date column</option>
                {dateColumns.map((column) => (
                  <option key={column.id} value={column.id}>
                    End: {column.name}
                  </option>
                ))}
              </select>
            )}

            {numberColumn && (
              <Input
                aria-label="View number min filter"
                type="number"
                placeholder={`${numberColumn.name} min`}
                value={viewConfigDraft.numberMin ?? ""}
                onChange={(event) =>
                  setViewConfigDraft((current) => {
                    const raw = event.target.value.trim();
                    const parsed = raw === "" ? null : Number(raw);

                    return {
                      ...current,
                      numberMin: raw === "" || Number.isNaN(parsed) ? null : parsed,
                    };
                  })
                }
              />
            )}

            {numberColumn && (
              <Input
                aria-label="View number max filter"
                type="number"
                placeholder={`${numberColumn.name} max`}
                value={viewConfigDraft.numberMax ?? ""}
                onChange={(event) =>
                  setViewConfigDraft((current) => {
                    const raw = event.target.value.trim();
                    const parsed = raw === "" ? null : Number(raw);

                    return {
                      ...current,
                      numberMax: raw === "" || Number.isNaN(parsed) ? null : parsed,
                    };
                  })
                }
              />
            )}

            {tagsColumn && (
              <Input
                aria-label="View tag filter"
                type="text"
                placeholder={`${tagsColumn.name} contains`}
                value={viewConfigDraft.tagValue ?? ""}
                onChange={(event) =>
                  setViewConfigDraft((current) => ({
                    ...current,
                    tagValue: event.target.value.trim() || null,
                  }))
                }
              />
            )}

            {checkboxColumn && (
              <select
                aria-label="View checkbox filter"
                className="h-10 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-sm"
                value={
                  viewConfigDraft.checkboxValue === undefined || viewConfigDraft.checkboxValue === null
                    ? "any"
                    : viewConfigDraft.checkboxValue
                      ? "true"
                      : "false"
                }
                onChange={(event) =>
                  setViewConfigDraft((current) => ({
                    ...current,
                    checkboxValue:
                      event.target.value === "any"
                        ? null
                        : event.target.value === "true",
                  }))
                }
              >
                <option value="any">All {checkboxColumn.name.toLowerCase()}</option>
                <option value="true">{checkboxColumn.name}: checked</option>
                <option value="false">{checkboxColumn.name}: unchecked</option>
              </select>
            )}

            {urlColumn && (
              <Input
                aria-label="View URL filter"
                type="text"
                placeholder={`${urlColumn.name} contains`}
                value={viewConfigDraft.urlQuery ?? ""}
                onChange={(event) =>
                  setViewConfigDraft((current) => ({
                    ...current,
                    urlQuery: event.target.value.trim() || null,
                  }))
                }
              />
            )}

            <select
              aria-label="View sort order"
              className="h-10 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-sm"
              value={viewConfigDraft.sortBy ?? "manual"}
              onChange={(event) =>
                setViewConfigDraft((current) => ({
                  ...current,
                  sortBy: event.target.value as NonNullable<StageBoardViewConfig["sortBy"]>,
                }))
              }
            >
              <option value="manual">Sort: Manual</option>
              <option value="name_asc">Sort: Name A-Z</option>
              <option value="name_desc">Sort: Name Z-A</option>
              <option value="date_asc">Sort: Date ascending</option>
              <option value="date_desc">Sort: Date descending</option>
              <option value="number_asc">Sort: Number ascending</option>
              <option value="number_desc">Sort: Number descending</option>
            </select>

            {!readOnly && (
              <Button
                loading={isSavingViewConfig}
                variant="secondary"
                className="h-10"
                onClick={() => void saveActiveViewConfig()}
              >
                Save View
              </Button>
            )}
          </div>
        )}

        {errorMessage && <p className="mt-3 text-sm text-rose-400">{errorMessage}</p>}
        {viewConfigMessage && (
          <p className="mt-2 text-sm text-[var(--color-foreground-muted)]">{viewConfigMessage}</p>
        )}
        {isLoadingShareSettings && !readOnly && (
          <p className="mt-2 text-xs text-[var(--color-foreground-muted)]">
            Loading board permissions...
          </p>
        )}
      </section>

      {!readOnly && (
        <>
          <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-soft)]">
            <div className="flex flex-col gap-3">
              <p className="text-sm font-medium text-[var(--color-foreground)]">Board permissions</p>
              <p className="text-sm text-[var(--color-foreground-muted)]">
                Visibility: {boardShareSettings?.isPrivate ? "Private" : "Workspace-visible"}
              </p>

              {canManage && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant={boardShareSettings?.isPrivate ? "secondary" : "primary"}
                    loading={isUpdatingShareSettings}
                    onClick={() => void updateBoardSharing({ isPrivate: false })}
                  >
                    Workspace-visible
                  </Button>
                  <Button
                    variant={boardShareSettings?.isPrivate ? "primary" : "secondary"}
                    loading={isUpdatingShareSettings}
                    onClick={() => void updateBoardSharing({ isPrivate: true })}
                  >
                    Private
                  </Button>
                </div>
              )}

              {canManage && !boardShareSettings?.isPrivate && (
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      loading={isUpdatingShareSettings}
                      onClick={() => void updateBoardSharing({ shareLinkEnabled: true })}
                    >
                      Enable share link
                    </Button>

                    {boardShareSettings?.shareUrl && (
                      <Button
                        variant="neutral"
                        loading={isUpdatingShareSettings}
                        onClick={() => void updateBoardSharing({ shareLinkEnabled: false })}
                      >
                        Disable share link
                      </Button>
                    )}
                  </div>

                  {boardShareSettings?.shareUrl && (
                    <a
                      href={boardShareSettings.shareUrl}
                      className="truncate text-sm text-[var(--color-brand-300)] underline"
                      target="_blank"
                      rel="noreferrer"
                    >
                      {boardShareSettings.shareUrl}
                    </a>
                  )}
                </div>
              )}

              {shareSettingsMessage && (
                <p className="text-sm text-[var(--color-foreground-muted)]">{shareSettingsMessage}</p>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-soft)]">
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-[var(--color-foreground)]">Notifications</p>
                <Button
                  variant="secondary"
                  className="h-8 px-3"
                  onClick={() => void loadNotifications()}
                  loading={isLoadingNotifications}
                >
                  Refresh
                </Button>
              </div>

              {notificationErrorMessage && (
                <p className="text-sm text-rose-400">{notificationErrorMessage}</p>
              )}

              {notifications.length === 0 && !isLoadingNotifications && (
                <p className="text-sm text-[var(--color-foreground-muted)]">No notifications yet.</p>
              )}

              {notifications.length > 0 && (
                <div className="space-y-2">
                  {notifications.map((notification) => (
                    <div
                      key={notification.id}
                      className={`rounded-lg border px-3 py-2 ${
                        notification.readAt
                          ? "border-[var(--color-border)] text-[var(--color-foreground-muted)]"
                          : "border-[var(--color-brand-500)] text-[var(--color-foreground)]"
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-medium">{notification.title}</p>
                        <p className="text-xs text-[var(--color-foreground-subtle)]">
                          {new Date(notification.createdAt).toLocaleString()}
                        </p>
                      </div>
                      <p className="mt-1 text-sm">{notification.message}</p>
                      <div className="mt-2 flex items-center gap-2 text-xs text-[var(--color-foreground-subtle)]">
                        <span>{notification.type}</span>
                        {notification.actorLabel && <span>by {notification.actorLabel}</span>}
                        {!notification.readAt && (
                          <Button
                            variant="neutral"
                            className="h-7 px-2"
                            loading={markingNotificationId === notification.id}
                            onClick={() => void markNotificationRead(notification.id)}
                          >
                            Mark read
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-soft)]">
            <div className="flex flex-col gap-3">
              <p className="text-sm font-medium text-[var(--color-foreground)]">
                Workspace members ({board.members.length})
              </p>

              <div className="flex flex-wrap gap-2">
                {board.members.map((member) => (
                  <span
                    key={member.userId}
                    className="rounded-md border border-[var(--color-border)] px-2 py-1 text-xs text-[var(--color-foreground-muted)]"
                  >
                    {member.name || member.email} · {member.role}
                  </span>
                ))}
              </div>

              {canManage && (
                <div className="grid gap-2 md:grid-cols-[minmax(220px,1fr)_170px_auto]">
                  <Input
                    aria-label="Invite email"
                    value={inviteEmailDraft}
                    onChange={(event) => setInviteEmailDraft(event.target.value)}
                    placeholder="teammate@company.com"
                    disabled={isInvitingMember}
                  />

                  <select
                    aria-label="Invite role"
                    value={inviteRoleDraft}
                    className="h-10 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-sm text-[var(--color-foreground)]"
                    onChange={(event) => {
                      setInviteRoleDraft(event.target.value as InviteRoleOption);
                    }}
                    disabled={isInvitingMember}
                  >
                    <option value="MEMBER">Member</option>
                    <option value="VIEWER">Viewer</option>
                    <option value="ADMIN">Admin</option>
                  </select>

                  <Button loading={isInvitingMember} onClick={() => void createWorkspaceInvite()}>
                    Invite
                  </Button>
                </div>
              )}

              {inviteStatusMessage && (
                <p className="text-sm text-[var(--color-foreground-muted)]">{inviteStatusMessage}</p>
              )}

              {latestInviteLink && (
                <a
                  href={latestInviteLink}
                  className="truncate text-sm text-[var(--color-brand-300)] underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  {latestInviteLink}
                </a>
              )}
            </div>
          </section>
        </>
      )}

      {hasNoVisibleItems && (
        <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-center shadow-[var(--shadow-soft)]">
          <p className="text-sm text-[var(--color-foreground-muted)]">
            {search.trim()
              ? `No items matched "${search.trim()}" with current view filters.`
              : "No items match the current view filters."}
          </p>
          <div className="mt-3">
            <Button
              variant="secondary"
              onClick={() => {
                setSearch("");
                setViewConfigDraft({});
              }}
            >
              Clear Filters
            </Button>
          </div>
        </section>
      )}

      {activeViewType === "TABLE" && !hasNoVisibleItems && (
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
                    if (isReadonlyBoard) {
                      setBoard((current) => {
                        if (!current) {
                          return current;
                        }

                        return {
                          ...current,
                          groups: current.groups.map((candidate) =>
                            candidate.id === group.id
                              ? {
                                  ...candidate,
                                  isCollapsed: !candidate.isCollapsed,
                                }
                              : candidate,
                          ),
                        };
                      });
                      return;
                    }

                    void updateGroup(group.id, { isCollapsed: !group.isCollapsed });
                  }}
                >
                  {group.isCollapsed ? "▶" : "▼"} {group.name}
                </button>

                {canWrite && (
                  <Button
                    variant="secondary"
                    onClick={() => void createItem(group.id)}
                    loading={creatingItemGroupId === group.id}
                  >
                    Add Item
                  </Button>
                )}
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
                            draggable={canWrite}
                            className={`border-b border-[var(--color-border)] px-3 py-2 text-left text-xs uppercase tracking-[0.12em] text-[var(--color-foreground-subtle)] ${
                              draggingColumnId === column.id ? "opacity-60" : ""
                            }`}
                            onDragStart={(event) => {
                              if (!canWrite) {
                                return;
                              }
                              event.dataTransfer.effectAllowed = "move";
                              event.dataTransfer.setData("text/plain", column.id);
                              setDraggingColumnId(column.id);
                            }}
                            onDragOver={(event) => {
                              if (!canWrite) {
                                return;
                              }
                              event.preventDefault();
                              event.dataTransfer.dropEffect = "move";
                            }}
                            onDrop={(event) => {
                              if (!canWrite) {
                                return;
                              }
                              event.preventDefault();
                              const movingColumnId = draggingColumnId || event.dataTransfer.getData("text/plain");

                              setDraggingColumnId(null);

                              if (!movingColumnId || movingColumnId === column.id) {
                                return;
                              }

                              void reorderColumns(movingColumnId, column.id);
                            }}
                            onDragEnd={() => {
                              if (!canWrite) {
                                return;
                              }
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
                                    <div className="flex min-w-[180px] flex-col gap-1">
                                      {isReadonlyBoard ? (
                                        <div className="flex min-h-9 min-w-[160px] items-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-foreground)]">
                                          {item.name}
                                        </div>
                                      ) : (
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
                                      )}
                                      <p className="px-1 text-xs text-[var(--color-foreground-subtle)]">
                                        {getLastEditedByLabel(item, visibleBoard)}
                                      </p>
                                    </div>
                                  </td>
                                  {visibleBoard.columns.map((column, index) => (
                                    <td key={`${item.id}:${column.id}`} className="px-3 py-2 align-top">
                                      {renderCell(
                                        item,
                                        column,
                                        visibleBoard,
                                        isReadonlyBoard,
                                        {
                                          rowIndex,
                                          columnIndex: index + 1,
                                          onArrowKey: handleArrowNavigation,
                                        },
                                        updateCell,
                                      )}
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
      )}

      {activeViewType === "KANBAN" && !hasNoVisibleItems && (
        <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-soft)]">
          <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
            {kanbanLanes.map((lane) => (
              <div
                key={lane.id}
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-strong)] p-3"
              >
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-semibold text-[var(--color-foreground)]">{lane.label}</p>
                  <span className="text-xs text-[var(--color-foreground-subtle)]">
                    {lane.items.length}
                  </span>
                </div>
                <div className="space-y-2">
                  {lane.items.length === 0 && (
                    <p className="text-xs text-[var(--color-foreground-subtle)]">No items</p>
                  )}
                  {lane.items.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-2"
                    >
                      <p className="text-sm font-medium text-[var(--color-foreground)]">{item.name}</p>
                      <p className="mt-1 text-xs text-[var(--color-foreground-subtle)]">
                        {getLastEditedByLabel(item, visibleBoard)}
                      </p>
                      {statusColumn && canWrite && (
                        <select
                          className="mt-2 h-8 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-xs"
                          value={getCell(item, statusColumn.id)?.statusValue ?? ""}
                          onChange={(event) => {
                            void updateCell(item.id, statusColumn, event.target.value || null);
                          }}
                        >
                          <option value="">Unassigned</option>
                          {statusOptions.map((option) => (
                            <option key={option.label} value={option.label}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {activeViewType === "CALENDAR" && !hasNoVisibleItems && (
        <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-soft)]">
          {!dateColumn && (
            <p className="text-sm text-[var(--color-foreground-muted)]">
              Calendar view requires a Date column.
            </p>
          )}
          {dateColumn && (
            <div className="space-y-2">
              {calendarEntries.map((entry) => (
                <div
                  key={entry.item.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-strong)] p-2"
                >
                  <div>
                    <p className="text-sm font-medium text-[var(--color-foreground)]">{entry.item.name}</p>
                    <p className="text-xs text-[var(--color-foreground-subtle)]">
                      {getLastEditedByLabel(entry.item, visibleBoard)}
                    </p>
                  </div>
                  {canWrite ? (
                    <Input
                      type="date"
                      className="h-9 w-[180px]"
                      value={entry.dateValue ? entry.dateValue.slice(0, 10) : ""}
                      onChange={(event) => {
                        void updateCell(entry.item.id, dateColumn, event.target.value || null);
                      }}
                    />
                  ) : (
                    <p className="text-sm text-[var(--color-foreground-muted)]">
                      {entry.dateValue ? entry.dateValue.slice(0, 10) : "No date"}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {activeViewType === "TIMELINE" && !hasNoVisibleItems && (
        <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-soft)]">
          {!dateColumn && (
            <p className="text-sm text-[var(--color-foreground-muted)]">
              Timeline view requires a Date column.
            </p>
          )}
          {dateColumn && (
            <div className="space-y-3">
              {timelineEntries.map((entry) => (
                <div key={entry.item.id} className="rounded-lg border border-[var(--color-border)] p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium text-[var(--color-foreground)]">{entry.item.name}</p>
                    <p className="text-xs text-[var(--color-foreground-subtle)]">
                      {formatTimelineDateLabel(entry.startDateValue, entry.endDateValue)}
                    </p>
                  </div>
                  <div className="mt-2 h-2 w-full rounded-full bg-[var(--color-border)]">
                    {entry.startOffsetPercent !== null && entry.spanPercent !== null && (
                      <div
                        className="h-2 rounded-full bg-[var(--color-brand-500)]"
                        style={{
                          marginLeft: `${entry.startOffsetPercent}%`,
                          width: `${Math.max(5, entry.spanPercent)}%`,
                        }}
                      />
                    )}
                  </div>
                  {canWrite && timelineStartColumn && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Input
                        aria-label={`Timeline start date for ${entry.item.name}`}
                        type="date"
                        className="h-9 w-[180px]"
                        value={entry.startDateValue ? entry.startDateValue.slice(0, 10) : ""}
                        onChange={(event) => {
                          void updateCell(
                            entry.item.id,
                            timelineStartColumn,
                            event.target.value || null,
                          );
                        }}
                      />
                      {timelineEndColumn && timelineEndColumn.id !== timelineStartColumn.id && (
                        <Input
                          aria-label={`Timeline end date for ${entry.item.name}`}
                          type="date"
                          className="h-9 w-[180px]"
                          value={entry.endDateValue ? entry.endDateValue.slice(0, 10) : ""}
                          onChange={(event) => {
                            void updateCell(
                              entry.item.id,
                              timelineEndColumn,
                              event.target.value || null,
                            );
                          }}
                        />
                      )}
                    </div>
                  )}
                  <p className="mt-1 text-xs text-[var(--color-foreground-subtle)]">
                    {getLastEditedByLabel(entry.item, visibleBoard)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {hasMoreServerItems && serverPagination && (
        <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-soft)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-[var(--color-foreground-muted)]">
              已从服务器加载 {serverPagination.loadedItems} / {serverPagination.totalItems} 项。
            </p>
            <Button
              variant="secondary"
              loading={isLoadingMoreItems}
              onClick={() => void loadMoreBoardItems()}
            >
              加载更多
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
