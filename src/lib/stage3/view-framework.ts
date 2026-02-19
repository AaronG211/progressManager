import { getStatusOptions } from "@/lib/stage1/search";
import type {
  StageBoardViewConfig,
  StageOneBoardSnapshot,
  StageOneColumn,
  StageOneItem,
  StageOneStatusOption,
} from "@/lib/stage1/types";

type SortableItem = StageOneItem;

export type StageKanbanLane = {
  id: string;
  label: string;
  color: string;
  items: StageOneItem[];
};

export type StageTimelineEntry = {
  item: StageOneItem;
  startDateValue: string | null;
  endDateValue: string | null;
  startOffsetPercent: number | null;
  spanPercent: number | null;
};

function getColumnByType(
  columns: StageOneColumn[],
  type: StageOneColumn["type"],
): StageOneColumn | null {
  return columns.find((column) => column.type === type) ?? null;
}

function getCellValue(item: StageOneItem, columnId: string | null) {
  if (!columnId) {
    return null;
  }

  const cell = item.values.find((value) => value.columnId === columnId);
  return cell ?? null;
}

function parseIsoDate(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
}

function sortItems(
  items: SortableItem[],
  sortBy: StageBoardViewConfig["sortBy"],
  columnIds: {
    date: string | null;
    number: string | null;
  },
): SortableItem[] {
  if (!sortBy || sortBy === "manual") {
    return [...items].sort((a, b) => a.position - b.position);
  }

  if (sortBy === "name_asc" || sortBy === "name_desc") {
    const multiplier = sortBy === "name_asc" ? 1 : -1;

    return [...items].sort((a, b) =>
      multiplier * a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
    );
  }

  if (sortBy === "number_asc" || sortBy === "number_desc") {
    const multiplier = sortBy === "number_asc" ? 1 : -1;

    return [...items].sort((a, b) => {
      const aNumber = getCellValue(a, columnIds.number)?.numberValue ?? null;
      const bNumber = getCellValue(b, columnIds.number)?.numberValue ?? null;

      if (aNumber === null && bNumber === null) {
        return a.position - b.position;
      }

      if (aNumber === null) {
        return 1;
      }

      if (bNumber === null) {
        return -1;
      }

      if (aNumber === bNumber) {
        return a.position - b.position;
      }

      return multiplier * (aNumber - bNumber);
    });
  }

  const multiplier = sortBy === "date_asc" ? 1 : -1;

  return [...items].sort((a, b) => {
    const aDate = parseIsoDate(getCellValue(a, columnIds.date)?.dateValue ?? null);
    const bDate = parseIsoDate(getCellValue(b, columnIds.date)?.dateValue ?? null);

    if (aDate === null && bDate === null) {
      return a.position - b.position;
    }

    if (aDate === null) {
      return 1;
    }

    if (bDate === null) {
      return -1;
    }

    if (aDate === bDate) {
      return a.position - b.position;
    }

    return multiplier * (aDate - bDate);
  });
}

function matchesConfig(
  item: StageOneItem,
  config: StageBoardViewConfig,
  columnIds: {
    status: string | null;
    person: string | null;
    date: string | null;
    number: string | null;
    tags: string | null;
    checkbox: string | null;
    url: string | null;
  },
): boolean {
  if (config.statusValue) {
    const statusValue = getCellValue(item, columnIds.status)?.statusValue ?? null;

    if (statusValue !== config.statusValue) {
      return false;
    }
  }

  if (config.personId) {
    const personId = getCellValue(item, columnIds.person)?.personId ?? null;

    if (personId !== config.personId) {
      return false;
    }
  }

  const dateFrom = config.dateFrom ? new Date(config.dateFrom).getTime() : null;
  const dateTo = config.dateTo ? new Date(config.dateTo).getTime() : null;

  if (dateFrom !== null || dateTo !== null) {
    const currentDate = parseIsoDate(getCellValue(item, columnIds.date)?.dateValue ?? null);

    if (currentDate === null) {
      return false;
    }

    if (dateFrom !== null && currentDate < dateFrom) {
      return false;
    }

    if (dateTo !== null && currentDate > dateTo) {
      return false;
    }
  }

  if (config.numberMin !== undefined && config.numberMin !== null) {
    const currentNumber = getCellValue(item, columnIds.number)?.numberValue ?? null;

    if (currentNumber === null || currentNumber < config.numberMin) {
      return false;
    }
  }

  if (config.numberMax !== undefined && config.numberMax !== null) {
    const currentNumber = getCellValue(item, columnIds.number)?.numberValue ?? null;

    if (currentNumber === null || currentNumber > config.numberMax) {
      return false;
    }
  }

  if (config.tagValue) {
    const tagValue = config.tagValue.trim().toLowerCase();
    const tags = getCellValue(item, columnIds.tags)?.tagsValue ?? [];

    if (!tags.some((entry) => entry.toLowerCase().includes(tagValue))) {
      return false;
    }
  }

  if (config.checkboxValue !== undefined && config.checkboxValue !== null) {
    const checked = getCellValue(item, columnIds.checkbox)?.checkboxValue ?? null;

    if (checked !== config.checkboxValue) {
      return false;
    }
  }

  if (config.urlQuery) {
    const query = config.urlQuery.trim().toLowerCase();
    const currentUrl = getCellValue(item, columnIds.url)?.urlValue ?? "";

    if (!currentUrl.toLowerCase().includes(query)) {
      return false;
    }
  }

  return true;
}

export function applyBoardViewConfig(
  board: StageOneBoardSnapshot,
  config: StageBoardViewConfig,
): StageOneBoardSnapshot {
  const statusColumn = getColumnByType(board.columns, "STATUS");
  const personColumn = getColumnByType(board.columns, "PERSON");
  const dateColumn = getColumnByType(board.columns, "DATE");
  const numberColumn = getColumnByType(board.columns, "NUMBER");
  const tagsColumn = getColumnByType(board.columns, "TAGS");
  const checkboxColumn = getColumnByType(board.columns, "CHECKBOX");
  const urlColumn = getColumnByType(board.columns, "URL");

  const nextGroups = board.groups
    .map((group) => ({
      ...group,
      items: sortItems(
        group.items.filter((item) =>
          matchesConfig(item, config, {
            status: statusColumn?.id ?? null,
            person: personColumn?.id ?? null,
            date: dateColumn?.id ?? null,
            number: numberColumn?.id ?? null,
            tags: tagsColumn?.id ?? null,
            checkbox: checkboxColumn?.id ?? null,
            url: urlColumn?.id ?? null,
          }),
        ),
        config.sortBy,
        {
          date: dateColumn?.id ?? null,
          number: numberColumn?.id ?? null,
        },
      ),
    }))
    .filter((group) => group.items.length > 0 || group.isCollapsed);

  return {
    ...board,
    groups: nextGroups,
  };
}

export function buildKanbanLanes(board: StageOneBoardSnapshot): StageKanbanLane[] {
  const statusColumn = getColumnByType(board.columns, "STATUS");

  if (!statusColumn) {
    return [];
  }

  const options = getStatusOptions(statusColumn.settings?.options);
  const byLabel = new Map<string, StageOneItem[]>();

  for (const option of options) {
    byLabel.set(option.label, []);
  }

  const unassigned: StageOneItem[] = [];

  for (const group of board.groups) {
    for (const item of group.items) {
      const statusValue = getCellValue(item, statusColumn.id)?.statusValue ?? null;

      if (!statusValue || !byLabel.has(statusValue)) {
        unassigned.push(item);
        continue;
      }

      byLabel.get(statusValue)?.push(item);
    }
  }

  const lanes: StageKanbanLane[] = options.map((option: StageOneStatusOption) => ({
    id: option.label,
    label: option.label,
    color: option.color,
    items: (byLabel.get(option.label) ?? []).sort((a, b) => a.position - b.position),
  }));

  lanes.push({
    id: "UNASSIGNED",
    label: "Unassigned",
    color: "slate",
    items: unassigned.sort((a, b) => a.position - b.position),
  });

  return lanes;
}

export function getDateColumnId(board: StageOneBoardSnapshot): string | null {
  return getColumnByType(board.columns, "DATE")?.id ?? null;
}

export function getDateColumns(board: StageOneBoardSnapshot): StageOneColumn[] {
  return board.columns
    .filter((column) => column.type === "DATE")
    .sort((a, b) => a.position - b.position);
}

function resolveDateColumnId(
  dateColumns: StageOneColumn[],
  requestedId: string | null | undefined,
  fallbackId: string | null,
): string | null {
  if (requestedId && dateColumns.some((column) => column.id === requestedId)) {
    return requestedId;
  }

  return fallbackId;
}

export function buildTimelineEntries(
  board: StageOneBoardSnapshot,
  options?: {
    startDateColumnId?: string | null;
    endDateColumnId?: string | null;
  },
): {
  entries: StageTimelineEntry[];
  startDateColumnId: string | null;
  endDateColumnId: string | null;
} {
  const dateColumns = getDateColumns(board);
  const defaultDateColumnId = dateColumns[0]?.id ?? null;
  const startDateColumnId = resolveDateColumnId(
    dateColumns,
    options?.startDateColumnId,
    defaultDateColumnId,
  );
  const endDateColumnId = resolveDateColumnId(dateColumns, options?.endDateColumnId, startDateColumnId);
  const items = board.groups.flatMap((group) =>
    [...group.items].sort((a, b) => a.position - b.position),
  );

  const rawEntries = items.map((item, index) => {
    let startDateValue = getCellValue(item, startDateColumnId)?.dateValue ?? null;
    let endDateValue = getCellValue(item, endDateColumnId)?.dateValue ?? null;
    let startTime = parseIsoDate(startDateValue);
    let endTime = parseIsoDate(endDateValue);

    if (startTime !== null && endTime === null) {
      endTime = startTime;
      endDateValue = startDateValue;
    } else if (startTime === null && endTime !== null) {
      startTime = endTime;
      startDateValue = endDateValue;
    }

    if (startTime !== null && endTime !== null && endTime < startTime) {
      const nextStartTime = endTime;
      const nextEndTime = startTime;
      const nextStartDateValue = endDateValue;
      const nextEndDateValue = startDateValue;

      startTime = nextStartTime;
      endTime = nextEndTime;
      startDateValue = nextStartDateValue;
      endDateValue = nextEndDateValue;
    }

    return {
      item,
      itemOrder: index,
      startDateValue,
      endDateValue,
      startTime,
      endTime,
    };
  });

  const sorted = [...rawEntries].sort((a, b) => {
    if (a.startTime === null && b.startTime === null) {
      return a.itemOrder - b.itemOrder;
    }

    if (a.startTime === null) {
      return 1;
    }

    if (b.startTime === null) {
      return -1;
    }

    if (a.startTime === b.startTime) {
      return a.itemOrder - b.itemOrder;
    }

    return a.startTime - b.startTime;
  });

  const dated = sorted.filter((entry) => entry.startTime !== null && entry.endTime !== null);

  if (dated.length === 0) {
    return {
      entries: sorted.map((entry) => ({
        item: entry.item,
        startDateValue: entry.startDateValue,
        endDateValue: entry.endDateValue,
        startOffsetPercent: null,
        spanPercent: null,
      })),
      startDateColumnId,
      endDateColumnId,
    };
  }

  const timelineStart = Math.min(...dated.map((entry) => entry.startTime as number));
  const timelineEnd = Math.max(...dated.map((entry) => entry.endTime as number));
  const timelineSpan = Math.max(1, timelineEnd - timelineStart);

  return {
    entries: sorted.map((entry) => {
      if (entry.startTime === null || entry.endTime === null) {
        return {
          item: entry.item,
          startDateValue: entry.startDateValue,
          endDateValue: entry.endDateValue,
          startOffsetPercent: null,
          spanPercent: null,
        };
      }

      const startOffsetPercent = Math.max(
        0,
        Math.min(100, ((entry.startTime - timelineStart) / timelineSpan) * 100),
      );
      const spanPercent = Math.max(
        0,
        Math.min(100 - startOffsetPercent, ((entry.endTime - entry.startTime) / timelineSpan) * 100),
      );

      return {
        item: entry.item,
        startDateValue: entry.startDateValue,
        endDateValue: entry.endDateValue,
        startOffsetPercent,
        spanPercent,
      };
    }),
    startDateColumnId,
    endDateColumnId,
  };
}

export function countBoardItems(board: StageOneBoardSnapshot): number {
  return board.groups.reduce((total, group) => total + group.items.length, 0);
}

export function limitBoardItems(
  board: StageOneBoardSnapshot,
  limit: number,
): StageOneBoardSnapshot {
  const normalizedLimit = Math.max(0, Math.floor(limit));

  if (normalizedLimit <= 0) {
    return {
      ...board,
      groups: board.groups.filter((group) => group.isCollapsed).map((group) => ({ ...group, items: [] })),
    };
  }

  let remaining = normalizedLimit;
  const groups = board.groups
    .map((group) => {
      if (remaining <= 0) {
        return {
          ...group,
          items: [],
        };
      }

      if (group.items.length <= remaining) {
        remaining -= group.items.length;
        return group;
      }

      const nextItems = group.items.slice(0, remaining);
      remaining = 0;

      return {
        ...group,
        items: nextItems,
      };
    })
    .filter((group) => group.items.length > 0 || group.isCollapsed);

  return {
    ...board,
    groups,
  };
}

export type StageBoardPageInfo = {
  itemOffset: number;
  itemLimit: number;
  returnedItems: number;
  totalItems: number;
  hasMore: boolean;
};

export function paginateBoardItems(
  board: StageOneBoardSnapshot,
  options: {
    itemOffset: number;
    itemLimit: number;
  },
): {
  snapshot: StageOneBoardSnapshot;
  pageInfo: StageBoardPageInfo;
} {
  const itemOffset = Math.max(0, Math.floor(options.itemOffset));
  const itemLimit = Math.max(1, Math.floor(options.itemLimit));
  const totalItems = countBoardItems(board);
  let remainingOffset = itemOffset;
  let remainingLimit = itemLimit;

  const groups = board.groups
    .map((group) => {
      if (remainingLimit <= 0) {
        return {
          ...group,
          items: [],
        };
      }

      if (remainingOffset >= group.items.length) {
        remainingOffset -= group.items.length;
        return {
          ...group,
          items: [],
        };
      }

      const sliceStart = remainingOffset;
      const sliceEnd = Math.min(group.items.length, sliceStart + remainingLimit);
      const items = group.items.slice(sliceStart, sliceEnd);

      remainingOffset = 0;
      remainingLimit -= items.length;

      return {
        ...group,
        items,
      };
    })
    .filter((group) => group.items.length > 0 || group.isCollapsed);

  const returnedItems = groups.reduce((sum, group) => sum + group.items.length, 0);
  const hasMore = itemOffset + returnedItems < totalItems;

  return {
    snapshot: {
      ...board,
      groups,
    },
    pageInfo: {
      itemOffset,
      itemLimit,
      returnedItems,
      totalItems,
      hasMore,
    },
  };
}
