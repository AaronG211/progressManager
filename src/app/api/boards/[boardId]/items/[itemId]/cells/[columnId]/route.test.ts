/** @vitest-environment node */

import { PATCH } from "@/app/api/boards/[boardId]/items/[itemId]/cells/[columnId]/route";
import { describe, expect, it, vi } from "vitest";

const { getBoardAccess, canWriteBoard } = vi.hoisted(() => ({
  getBoardAccess: vi.fn(),
  canWriteBoard: vi.fn(),
}));

const { writeWorkspaceAuditLog } = vi.hoisted(() => ({
  writeWorkspaceAuditLog: vi.fn(),
}));

const { createMentionNotifications, createAssignmentChangeNotifications } = vi.hoisted(() => ({
  createMentionNotifications: vi.fn(),
  createAssignmentChangeNotifications: vi.fn(),
}));

const prismaMocks = vi.hoisted(() => ({
  boardItemFindFirst: vi.fn(),
  boardItemUpdate: vi.fn(),
  boardColumnFindFirst: vi.fn(),
  boardCellValueFindUnique: vi.fn(),
  boardCellValueUpsert: vi.fn(),
}));

vi.mock("@/lib/stage1/route-utils", () => ({
  getBoardAccess,
  canWriteBoard,
}));

vi.mock("@/lib/stage2/audit", () => ({
  writeWorkspaceAuditLog,
}));

vi.mock("@/lib/stage2/notifications", () => ({
  createMentionNotifications,
  createAssignmentChangeNotifications,
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    boardItem: {
      findFirst: prismaMocks.boardItemFindFirst,
      update: prismaMocks.boardItemUpdate,
    },
    boardColumn: {
      findFirst: prismaMocks.boardColumnFindFirst,
    },
    boardCellValue: {
      findUnique: prismaMocks.boardCellValueFindUnique,
      upsert: prismaMocks.boardCellValueUpsert,
    },
  },
}));

vi.mock("@/lib/observability", () => ({
  getTelemetryClient: () => ({
    track: vi.fn(),
    identify: vi.fn(),
    captureException: vi.fn(),
  }),
}));

describe("PATCH /api/boards/[boardId]/items/[itemId]/cells/[columnId]", () => {
  it("writes workspace audit log when cell value changes", async () => {
    getBoardAccess.mockResolvedValueOnce({
      status: "ok",
      userId: "user_1",
      role: "MEMBER",
    });
    canWriteBoard.mockReturnValueOnce(true);

    prismaMocks.boardItemFindFirst.mockResolvedValueOnce({ id: "item_1" });
    prismaMocks.boardColumnFindFirst.mockResolvedValueOnce({
      id: "column_1",
      name: "Status",
      type: "STATUS",
      board: {
        workspaceId: "workspace_1",
      },
    });
    prismaMocks.boardCellValueFindUnique.mockResolvedValueOnce({
      textValue: null,
      statusValue: "Not Started",
      personId: null,
      dateValue: null,
      numberValue: null,
      tagsValue: null,
      checkboxValue: null,
      urlValue: null,
    });
    prismaMocks.boardCellValueUpsert.mockResolvedValueOnce({
      id: "value_1",
      itemId: "item_1",
      columnId: "column_1",
      textValue: null,
      statusValue: "Working",
      personId: null,
      dateValue: null,
      numberValue: null,
      tagsValue: null,
      checkboxValue: null,
      urlValue: null,
    });
    prismaMocks.boardItemUpdate.mockResolvedValueOnce({
      lastEditedById: "user_1",
    });

    const response = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({ statusValue: "Working" }),
      }),
      {
        params: Promise.resolve({
          boardId: "board_1",
          itemId: "item_1",
          columnId: "column_1",
        }),
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        id: "value_1",
        itemLastEditedById: "user_1",
      }),
    );
    expect(writeWorkspaceAuditLog).toHaveBeenCalledTimes(1);
    expect(writeWorkspaceAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace_1",
        action: "board_item_cell_updated",
        entityType: "BoardCellValue",
        entityId: "value_1",
      }),
    );
  });

  it("creates assignment-change notifications for person column updates", async () => {
    getBoardAccess.mockResolvedValueOnce({
      status: "ok",
      userId: "user_1",
      role: "MEMBER",
    });
    canWriteBoard.mockReturnValueOnce(true);

    prismaMocks.boardItemFindFirst.mockResolvedValueOnce({ id: "item_1", name: "Task A" });
    prismaMocks.boardColumnFindFirst.mockResolvedValueOnce({
      id: "column_2",
      name: "Owner",
      type: "PERSON",
      board: {
        workspaceId: "workspace_1",
      },
    });
    prismaMocks.boardCellValueFindUnique.mockResolvedValueOnce({
      textValue: null,
      statusValue: null,
      personId: "cm0member00000000000000002",
      dateValue: null,
      numberValue: null,
      tagsValue: null,
      checkboxValue: null,
      urlValue: null,
    });
    prismaMocks.boardCellValueUpsert.mockResolvedValueOnce({
      id: "value_2",
      itemId: "item_1",
      columnId: "column_2",
      textValue: null,
      statusValue: null,
      personId: "cm0member00000000000000003",
      dateValue: null,
      numberValue: null,
      tagsValue: null,
      checkboxValue: null,
      urlValue: null,
    });
    prismaMocks.boardItemUpdate.mockResolvedValueOnce({
      lastEditedById: "user_1",
    });

    const response = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({ personId: "cm0member00000000000000003" }),
      }),
      {
        params: Promise.resolve({
          boardId: "board_1",
          itemId: "item_1",
          columnId: "column_2",
        }),
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        id: "value_2",
        itemLastEditedById: "user_1",
      }),
    );
    expect(createAssignmentChangeNotifications).toHaveBeenCalledTimes(1);
    expect(createAssignmentChangeNotifications).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace_1",
        itemName: "Task A",
        previousAssigneeId: "cm0member00000000000000002",
        nextAssigneeId: "cm0member00000000000000003",
      }),
    );
  });

  it("updates tags column values and returns normalized tags", async () => {
    getBoardAccess.mockResolvedValueOnce({
      status: "ok",
      userId: "user_1",
      role: "MEMBER",
    });
    canWriteBoard.mockReturnValueOnce(true);

    prismaMocks.boardItemFindFirst.mockResolvedValueOnce({ id: "item_3", name: "Task Tags" });
    prismaMocks.boardColumnFindFirst.mockResolvedValueOnce({
      id: "column_3",
      name: "Tags",
      type: "TAGS",
      board: {
        workspaceId: "workspace_1",
      },
    });
    prismaMocks.boardCellValueFindUnique.mockResolvedValueOnce({
      textValue: null,
      statusValue: null,
      personId: null,
      dateValue: null,
      numberValue: null,
      tagsValue: ["MVP"],
      checkboxValue: null,
      urlValue: null,
    });
    prismaMocks.boardCellValueUpsert.mockResolvedValueOnce({
      id: "value_3",
      itemId: "item_3",
      columnId: "column_3",
      textValue: null,
      statusValue: null,
      personId: null,
      dateValue: null,
      numberValue: null,
      tagsValue: ["MVP", "Urgent"],
      checkboxValue: null,
      urlValue: null,
    });
    prismaMocks.boardItemUpdate.mockResolvedValueOnce({
      lastEditedById: "user_1",
    });

    const response = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({ tagsValue: ["MVP", "Urgent"] }),
      }),
      {
        params: Promise.resolve({
          boardId: "board_1",
          itemId: "item_3",
          columnId: "column_3",
        }),
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        id: "value_3",
        tagsValue: ["MVP", "Urgent"],
      }),
    );
  });
});
