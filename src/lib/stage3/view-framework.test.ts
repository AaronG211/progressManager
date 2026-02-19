import {
  applyBoardViewConfig,
  buildTimelineEntries,
  buildKanbanLanes,
  countBoardItems,
  getDateColumns,
  getDateColumnId,
  limitBoardItems,
  paginateBoardItems,
} from "@/lib/stage3/view-framework";
import type { StageOneBoardSnapshot } from "@/lib/stage1/types";
import { describe, expect, it } from "vitest";

function patchItemCell(
  board: StageOneBoardSnapshot,
  itemId: string,
  columnId: string,
  patch: Partial<StageOneBoardSnapshot["groups"][number]["items"][number]["values"][number]>,
): StageOneBoardSnapshot {
  return {
    ...board,
    groups: board.groups.map((group) => ({
      ...group,
      items: group.items.map((item) => {
        if (item.id !== itemId) {
          return item;
        }

        const existingIndex = item.values.findIndex((value) => value.columnId === columnId);

        if (existingIndex === -1) {
          return {
            ...item,
            values: [
              ...item.values,
              {
                id: `${itemId}_${columnId}`,
                itemId,
                columnId,
                textValue: null,
                statusValue: null,
                personId: null,
                dateValue: null,
                numberValue: null,
                tagsValue: null,
                checkboxValue: null,
                urlValue: null,
                ...patch,
              },
            ],
          };
        }

        return {
          ...item,
          values: item.values.map((value, index) =>
            index === existingIndex
              ? {
                  ...value,
                  ...patch,
                }
              : value,
          ),
        };
      }),
    })),
  };
}

const boardFixture: StageOneBoardSnapshot = {
  workspaceId: "workspace_1",
  boardId: "board_1",
  boardName: "Demo",
  views: [],
  columns: [
    {
      id: "column_text",
      name: "Notes",
      type: "TEXT",
      position: 0,
      settings: null,
    },
    {
      id: "column_status",
      name: "Status",
      type: "STATUS",
      position: 1,
      settings: {
        options: [
          { label: "Not Started", color: "slate" },
          { label: "Working", color: "amber" },
        ],
      },
    },
    {
      id: "column_owner",
      name: "Owner",
      type: "PERSON",
      position: 2,
      settings: null,
    },
    {
      id: "column_due",
      name: "Due Date",
      type: "DATE",
      position: 3,
      settings: null,
    },
    {
      id: "column_estimate",
      name: "Estimate",
      type: "NUMBER",
      position: 4,
      settings: null,
    },
    {
      id: "column_tags",
      name: "Tags",
      type: "TAGS",
      position: 5,
      settings: null,
    },
    {
      id: "column_done",
      name: "Done",
      type: "CHECKBOX",
      position: 6,
      settings: null,
    },
    {
      id: "column_url",
      name: "Reference URL",
      type: "URL",
      position: 7,
      settings: null,
    },
  ],
  groups: [
    {
      id: "group_1",
      name: "Backlog",
      position: 0,
      isCollapsed: false,
      items: [
        {
          id: "item_1",
          groupId: "group_1",
          name: "A",
          position: 1,
          lastEditedById: null,
          values: [
            {
              id: "v1",
              itemId: "item_1",
              columnId: "column_status",
              textValue: null,
              statusValue: "Working",
              personId: null,
              dateValue: null,
              numberValue: null,
              tagsValue: null,
              checkboxValue: null,
              urlValue: null,
            },
            {
              id: "v2",
              itemId: "item_1",
              columnId: "column_owner",
              textValue: null,
              statusValue: null,
              personId: "user_1",
              dateValue: null,
              numberValue: null,
              tagsValue: null,
              checkboxValue: null,
              urlValue: null,
            },
            {
              id: "v3",
              itemId: "item_1",
              columnId: "column_due",
              textValue: null,
              statusValue: null,
              personId: null,
              dateValue: "2026-02-20T00:00:00.000Z",
              numberValue: null,
              tagsValue: null,
              checkboxValue: null,
              urlValue: null,
            },
            {
              id: "v4",
              itemId: "item_1",
              columnId: "column_estimate",
              textValue: null,
              statusValue: null,
              personId: null,
              dateValue: null,
              numberValue: 8,
              tagsValue: null,
              checkboxValue: null,
              urlValue: null,
            },
            {
              id: "v5",
              itemId: "item_1",
              columnId: "column_tags",
              textValue: null,
              statusValue: null,
              personId: null,
              dateValue: null,
              numberValue: null,
              tagsValue: ["MVP", "Planning"],
              checkboxValue: null,
              urlValue: null,
            },
            {
              id: "v6",
              itemId: "item_1",
              columnId: "column_done",
              textValue: null,
              statusValue: null,
              personId: null,
              dateValue: null,
              numberValue: null,
              tagsValue: null,
              checkboxValue: true,
              urlValue: null,
            },
            {
              id: "v7",
              itemId: "item_1",
              columnId: "column_url",
              textValue: null,
              statusValue: null,
              personId: null,
              dateValue: null,
              numberValue: null,
              tagsValue: null,
              checkboxValue: null,
              urlValue: "https://docs.example.com/mvp",
            },
          ],
        },
        {
          id: "item_2",
          groupId: "group_1",
          name: "B",
          position: 0,
          lastEditedById: null,
          values: [
            {
              id: "v8",
              itemId: "item_2",
              columnId: "column_status",
              textValue: null,
              statusValue: "Not Started",
              personId: null,
              dateValue: null,
              numberValue: null,
              tagsValue: null,
              checkboxValue: null,
              urlValue: null,
            },
            {
              id: "v9",
              itemId: "item_2",
              columnId: "column_estimate",
              textValue: null,
              statusValue: null,
              personId: null,
              dateValue: null,
              numberValue: 2,
              tagsValue: null,
              checkboxValue: null,
              urlValue: null,
            },
            {
              id: "v10",
              itemId: "item_2",
              columnId: "column_done",
              textValue: null,
              statusValue: null,
              personId: null,
              dateValue: null,
              numberValue: null,
              tagsValue: null,
              checkboxValue: false,
              urlValue: null,
            },
            {
              id: "v11",
              itemId: "item_2",
              columnId: "column_url",
              textValue: null,
              statusValue: null,
              personId: null,
              dateValue: null,
              numberValue: null,
              tagsValue: null,
              checkboxValue: null,
              urlValue: "https://status.example.com/task-b",
            },
          ],
        },
      ],
    },
  ],
  members: [],
};

describe("stage3 view framework", () => {
  it("filters by status and sorts by name asc", () => {
    const filtered = applyBoardViewConfig(boardFixture, {
      statusValue: "Working",
      sortBy: "name_asc",
    });

    expect(filtered.groups).toHaveLength(1);
    expect(filtered.groups[0].items).toHaveLength(1);
    expect(filtered.groups[0].items[0].id).toBe("item_1");
  });

  it("builds kanban lanes from status options and unassigned", () => {
    const lanes = buildKanbanLanes(boardFixture);

    expect(lanes[0].label).toBe("Not Started");
    expect(lanes[1].label).toBe("Working");
    expect(lanes.at(-1)?.label).toBe("Unassigned");
  });

  it("returns board date column id", () => {
    expect(getDateColumnId(boardFixture)).toBe("column_due");
  });

  it("returns ordered date columns", () => {
    expect(getDateColumns(boardFixture).map((column) => column.id)).toEqual(["column_due"]);
  });

  it("builds timeline entries from date range columns with normalized order", () => {
    const boardWithRangeColumn: StageOneBoardSnapshot = {
      ...boardFixture,
      columns: [
        ...boardFixture.columns,
        {
          id: "column_end",
          name: "End Date",
          type: "DATE",
          position: 8,
          settings: null,
        },
      ],
    };

    const rangeBoard = patchItemCell(
      patchItemCell(
        patchItemCell(
          patchItemCell(boardWithRangeColumn, "item_1", "column_due", {
            dateValue: "2026-02-20T00:00:00.000Z",
          }),
          "item_1",
          "column_end",
          {
            dateValue: "2026-02-23T00:00:00.000Z",
          },
        ),
        "item_2",
        "column_due",
        {
          dateValue: "2026-02-22T00:00:00.000Z",
        },
      ),
      "item_2",
      "column_end",
      {
        dateValue: "2026-02-21T00:00:00.000Z",
      },
    );

    const { entries, startDateColumnId, endDateColumnId } = buildTimelineEntries(rangeBoard, {
      startDateColumnId: "column_due",
      endDateColumnId: "column_end",
    });

    expect(startDateColumnId).toBe("column_due");
    expect(endDateColumnId).toBe("column_end");
    expect(entries.map((entry) => entry.item.id)).toEqual(["item_1", "item_2"]);
    expect(entries[0].startDateValue?.slice(0, 10)).toBe("2026-02-20");
    expect(entries[0].endDateValue?.slice(0, 10)).toBe("2026-02-23");
    expect(entries[1].startDateValue?.slice(0, 10)).toBe("2026-02-21");
    expect(entries[1].endDateValue?.slice(0, 10)).toBe("2026-02-22");
    expect(entries[0].startOffsetPercent).toBe(0);
    expect(entries[0].spanPercent).not.toBeNull();
    expect(entries[1].startOffsetPercent).not.toBeNull();
    expect((entries[1].startOffsetPercent as number) > 0).toBe(true);
  });

  it("falls back to first date column when timeline column ids are invalid", () => {
    const { startDateColumnId, endDateColumnId } = buildTimelineEntries(boardFixture, {
      startDateColumnId: "missing_column",
      endDateColumnId: "missing_column",
    });

    expect(startDateColumnId).toBe("column_due");
    expect(endDateColumnId).toBe("column_due");
  });

  it("filters by number range and sorts by number desc", () => {
    const filtered = applyBoardViewConfig(boardFixture, {
      numberMin: 3,
      numberMax: 10,
      sortBy: "number_desc",
    });

    expect(filtered.groups[0].items).toHaveLength(1);
    expect(filtered.groups[0].items[0].id).toBe("item_1");
  });

  it("filters by tag, checkbox and url query", () => {
    const filtered = applyBoardViewConfig(boardFixture, {
      tagValue: "mvp",
      checkboxValue: true,
      urlQuery: "docs.example.com",
    });

    expect(filtered.groups[0].items).toHaveLength(1);
    expect(filtered.groups[0].items[0].id).toBe("item_1");
  });

  it("limits board items for non-table view rendering", () => {
    const limited = limitBoardItems(boardFixture, 1);

    expect(countBoardItems(limited)).toBe(1);
    expect(limited.groups[0].items[0].id).toBe("item_1");
  });

  it("returns paginated board items with page metadata", () => {
    const { snapshot, pageInfo } = paginateBoardItems(boardFixture, {
      itemOffset: 1,
      itemLimit: 1,
    });

    expect(countBoardItems(snapshot)).toBe(1);
    expect(snapshot.groups[0].items[0].id).toBe("item_2");
    expect(pageInfo).toEqual({
      itemOffset: 1,
      itemLimit: 1,
      returnedItems: 1,
      totalItems: 2,
      hasMore: false,
    });
  });

  it("handles large-board pagination (>5k items) with stable metadata", () => {
    const largeBoard: StageOneBoardSnapshot = {
      ...boardFixture,
      groups: [
        {
          ...boardFixture.groups[0],
          items: Array.from({ length: 5_200 }, (_, index) => ({
            id: `large_item_${index}`,
            groupId: "group_1",
            name: `Large Item ${index}`,
            position: index,
            lastEditedById: null,
            values: [],
          })),
        },
      ],
    };

    const { snapshot, pageInfo } = paginateBoardItems(largeBoard, {
      itemOffset: 4_900,
      itemLimit: 400,
    });

    expect(countBoardItems(snapshot)).toBe(300);
    expect(snapshot.groups[0].items[0].id).toBe("large_item_4900");
    expect(snapshot.groups[0].items.at(-1)?.id).toBe("large_item_5199");
    expect(pageInfo).toEqual({
      itemOffset: 4_900,
      itemLimit: 400,
      returnedItems: 300,
      totalItems: 5_200,
      hasMore: false,
    });
  });

  it("keeps cross-view consistency after status edit (table -> kanban/filter)", () => {
    const editedBoard = patchItemCell(boardFixture, "item_2", "column_status", {
      statusValue: "Working",
    });

    const filtered = applyBoardViewConfig(editedBoard, {
      statusValue: "Working",
      sortBy: "name_asc",
    });
    const lanes = buildKanbanLanes(editedBoard);
    const workingLane = lanes.find((lane) => lane.label === "Working");

    expect(filtered.groups[0].items.map((item) => item.id)).toEqual(["item_1", "item_2"]);
    expect(workingLane?.items.map((item) => item.id).sort()).toEqual(["item_1", "item_2"]);
  });

  it("keeps cross-view consistency after date edit (table -> calendar sort)", () => {
    const editedBoard = patchItemCell(boardFixture, "item_2", "column_due", {
      dateValue: "2026-02-18T00:00:00.000Z",
    });

    const dateColumnId = getDateColumnId(editedBoard);
    expect(dateColumnId).toBe("column_due");
    const orderedByDate = editedBoard.groups
      .flatMap((group) => group.items)
      .map((item) => ({
        id: item.id,
        dateValue: item.values.find((value) => value.columnId === dateColumnId)?.dateValue ?? null,
      }))
      .sort((a, b) => {
        const aTime = a.dateValue ? new Date(a.dateValue).getTime() : Number.POSITIVE_INFINITY;
        const bTime = b.dateValue ? new Date(b.dateValue).getTime() : Number.POSITIVE_INFINITY;
        return aTime - bTime;
      });

    expect(orderedByDate.map((entry) => entry.id)).toEqual(["item_2", "item_1"]);
  });
});
