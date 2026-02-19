import {
  buildPagedBootstrapPath,
  mergePagedSnapshot,
  normalizeBootstrapResponse,
  type BoardBootstrapEnvelope,
} from "@/lib/stage3/client-pagination";
import type { StageOneBoardSnapshot, StageOneCellValue, StageOneItem } from "@/lib/stage1/types";
import { describe, expect, it } from "vitest";

function makeCell(overrides: Partial<StageOneCellValue>): StageOneCellValue {
  return {
    id: "cell_1",
    itemId: "item_1",
    columnId: "column_text",
    textValue: null,
    statusValue: null,
    personId: null,
    dateValue: null,
    numberValue: null,
    tagsValue: null,
    checkboxValue: null,
    urlValue: null,
    ...overrides,
  };
}

function makeItem(id: string, groupId: string, position: number): StageOneItem {
  return {
    id,
    groupId,
    name: id,
    position,
    lastEditedById: null,
    values: [makeCell({ id: `cell_${id}`, itemId: id })],
  };
}

const baseSnapshot: StageOneBoardSnapshot = {
  workspaceId: "workspace_1",
  boardId: "board_1",
  boardName: "Board A",
  views: [],
  columns: [
    {
      id: "column_text",
      name: "Notes",
      type: "TEXT",
      position: 0,
      settings: null,
    },
  ],
  groups: [
    {
      id: "group_a",
      name: "Group A",
      position: 0,
      isCollapsed: false,
      items: [makeItem("item_1", "group_a", 0), makeItem("item_2", "group_a", 1)],
    },
  ],
  members: [],
};

describe("stage3 client pagination helpers", () => {
  it("builds paged bootstrap path in node runtime", () => {
    expect(buildPagedBootstrapPath("/api/boards/bootstrap", { itemOffset: 100, itemLimit: 300 })).toBe(
      "/api/boards/bootstrap?itemOffset=100&itemLimit=300",
    );
    expect(
      buildPagedBootstrapPath("/api/boards/bootstrap?mode=test", { itemOffset: 10, itemLimit: 20 }),
    ).toBe("/api/boards/bootstrap?mode=test&itemOffset=10&itemLimit=20");
  });

  it("normalizes raw snapshot response", () => {
    const normalized = normalizeBootstrapResponse(baseSnapshot);

    expect(normalized.snapshot.boardId).toBe("board_1");
    expect(normalized.pagination).toBeNull();
  });

  it("normalizes envelope response with pagination state", () => {
    const envelope: BoardBootstrapEnvelope = {
      snapshot: baseSnapshot,
      pageInfo: {
        itemOffset: 300,
        itemLimit: 300,
        returnedItems: 250,
        totalItems: 1_200,
        hasMore: true,
      },
    };

    const normalized = normalizeBootstrapResponse(envelope);

    expect(normalized.pagination).toEqual({
      nextOffset: 550,
      itemLimit: 300,
      loadedItems: 550,
      totalItems: 1_200,
      hasMore: true,
    });
  });

  it("merges paged snapshots and deduplicates items by id", () => {
    const current = baseSnapshot;
    const incoming: StageOneBoardSnapshot = {
      ...baseSnapshot,
      boardName: "Board A Updated",
      groups: [
        {
          ...baseSnapshot.groups[0],
          items: [
            makeItem("item_2", "group_a", 1),
            makeItem("item_3", "group_a", 2),
          ],
        },
      ],
    };

    const merged = mergePagedSnapshot(current, incoming);

    expect(merged.boardName).toBe("Board A Updated");
    expect(merged.groups[0].items.map((item) => item.id)).toEqual(["item_1", "item_2", "item_3"]);
  });

  it("overrides existing item data when same id appears in later page", () => {
    const current = baseSnapshot;
    const incoming: StageOneBoardSnapshot = {
      ...baseSnapshot,
      groups: [
        {
          ...baseSnapshot.groups[0],
          items: [
            {
              ...makeItem("item_2", "group_a", 1),
              name: "item_2_updated",
              lastEditedById: "user_2",
            },
          ],
        },
      ],
    };

    const merged = mergePagedSnapshot(current, incoming);
    const updatedItem = merged.groups[0].items.find((item) => item.id === "item_2");

    expect(updatedItem?.name).toBe("item_2_updated");
    expect(updatedItem?.lastEditedById).toBe("user_2");
  });
});
