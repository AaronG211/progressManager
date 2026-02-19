import type { StageOneBoardSnapshot, StageOneGroup } from "@/lib/stage1/types";
import type { StageBoardPageInfo } from "@/lib/stage3/view-framework";

export type BoardBootstrapEnvelope = {
  snapshot: StageOneBoardSnapshot;
  pageInfo: StageBoardPageInfo | null;
};

export type BoardPaginationState = {
  nextOffset: number;
  itemLimit: number;
  loadedItems: number;
  totalItems: number;
  hasMore: boolean;
};

export function buildPagedBootstrapPath(
  basePath: string,
  options: {
    itemOffset: number;
    itemLimit: number;
  },
): string {
  if (typeof window === "undefined") {
    const delimiter = basePath.includes("?") ? "&" : "?";
    return `${basePath}${delimiter}itemOffset=${options.itemOffset}&itemLimit=${options.itemLimit}`;
  }

  const url = new URL(basePath, window.location.origin);
  url.searchParams.set("itemOffset", String(options.itemOffset));
  url.searchParams.set("itemLimit", String(options.itemLimit));
  return `${url.pathname}${url.search}`;
}

export function normalizeBootstrapResponse(
  payload: StageOneBoardSnapshot | BoardBootstrapEnvelope,
): {
  snapshot: StageOneBoardSnapshot;
  pagination: BoardPaginationState | null;
} {
  if ("snapshot" in payload && "pageInfo" in payload) {
    const pageInfo = payload.pageInfo;

    if (!pageInfo) {
      return {
        snapshot: payload.snapshot,
        pagination: null,
      };
    }

    const loadedItems = pageInfo.itemOffset + pageInfo.returnedItems;

    return {
      snapshot: payload.snapshot,
      pagination: {
        nextOffset: loadedItems,
        itemLimit: pageInfo.itemLimit,
        loadedItems,
        totalItems: pageInfo.totalItems,
        hasMore: pageInfo.hasMore,
      },
    };
  }

  return {
    snapshot: payload as StageOneBoardSnapshot,
    pagination: null,
  };
}

export function mergePagedSnapshot(
  current: StageOneBoardSnapshot,
  incoming: StageOneBoardSnapshot,
): StageOneBoardSnapshot {
  const mergedById = new Map<string, StageOneGroup>();

  for (const group of current.groups) {
    mergedById.set(group.id, {
      ...group,
      items: [...group.items],
    });
  }

  for (const incomingGroup of incoming.groups) {
    const existing = mergedById.get(incomingGroup.id);

    if (!existing) {
      mergedById.set(incomingGroup.id, incomingGroup);
      continue;
    }

    const mergedItemsById = new Map(existing.items.map((item) => [item.id, item]));

    for (const incomingItem of incomingGroup.items) {
      // Prefer the latest page payload for duplicated items.
      mergedItemsById.set(incomingItem.id, incomingItem);
    }

    mergedById.set(incomingGroup.id, {
      ...existing,
      name: incomingGroup.name,
      position: incomingGroup.position,
      items: Array.from(mergedItemsById.values()).sort((a, b) => a.position - b.position),
    });
  }

  return {
    ...current,
    boardName: incoming.boardName,
    views: incoming.views,
    columns: incoming.columns,
    members: incoming.members,
    groups: Array.from(mergedById.values()).sort((a, b) => a.position - b.position),
  };
}
