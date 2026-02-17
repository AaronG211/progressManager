import { buildBoardCsv } from "@/lib/stage1/csv";
import type { StageOneBoardSnapshot } from "@/lib/stage1/types";
import { describe, expect, it } from "vitest";

const snapshotFixture: StageOneBoardSnapshot = {
  workspaceId: "ws_1",
  boardId: "board_1",
  boardName: "Stage 1 Tasks",
  columns: [
    {
      id: "col_text",
      name: "Notes",
      type: "TEXT",
      position: 0,
      settings: null,
    },
    {
      id: "col_status",
      name: "Status",
      type: "STATUS",
      position: 1,
      settings: null,
    },
    {
      id: "col_person",
      name: "Owner",
      type: "PERSON",
      position: 2,
      settings: null,
    },
    {
      id: "col_date",
      name: "Due Date",
      type: "DATE",
      position: 3,
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
          name: "Define MVP scope",
          position: 0,
          lastEditedById: null,
          values: [
            {
              id: "val_1",
              itemId: "item_1",
              columnId: "col_text",
              textValue: "Capture must-have board editing",
              statusValue: null,
              personId: null,
              dateValue: null,
            },
            {
              id: "val_2",
              itemId: "item_1",
              columnId: "col_status",
              textValue: null,
              statusValue: "Working",
              personId: null,
              dateValue: null,
            },
            {
              id: "val_3",
              itemId: "item_1",
              columnId: "col_person",
              textValue: null,
              statusValue: null,
              personId: "user_1",
              dateValue: null,
            },
            {
              id: "val_4",
              itemId: "item_1",
              columnId: "col_date",
              textValue: null,
              statusValue: null,
              personId: null,
              dateValue: "2026-02-20T00:00:00.000Z",
            },
          ],
        },
      ],
    },
  ],
  members: [
    {
      userId: "user_1",
      email: "owner@example.com",
      name: "Demo Owner",
      role: "OWNER",
    },
  ],
};

describe("buildBoardCsv", () => {
  it("builds csv rows with typed column values", () => {
    const csv = buildBoardCsv(snapshotFixture);

    expect(csv).toContain("Group,Item,Notes,Status,Owner,Due Date");
    expect(csv).toContain("Backlog,Define MVP scope,Capture must-have board editing,Working,Demo Owner,2026-02-20");
  });

  it("escapes commas, quotes and new lines", () => {
    const csv = buildBoardCsv({
      ...snapshotFixture,
      groups: [
        {
          ...snapshotFixture.groups[0],
          items: [
            {
              ...snapshotFixture.groups[0].items[0],
              name: "Ship, \"Stage 1\"",
              values: snapshotFixture.groups[0].items[0].values.map((value) =>
                value.columnId === "col_text"
                  ? {
                      ...value,
                      textValue: "Line 1\nLine 2",
                    }
                  : value,
              ),
            },
          ],
        },
      ],
    });

    expect(csv).toContain("\"Ship, \"\"Stage 1\"\"\"");
    expect(csv).toContain("\"Line 1\nLine 2\"");
  });
});
