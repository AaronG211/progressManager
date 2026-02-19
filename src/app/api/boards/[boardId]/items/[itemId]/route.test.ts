/** @vitest-environment node */

import { PATCH } from "@/app/api/boards/[boardId]/items/[itemId]/route";
import { describe, expect, it, vi } from "vitest";

const { getBoardAccess, canWriteBoard } = vi.hoisted(() => ({
  getBoardAccess: vi.fn(),
  canWriteBoard: vi.fn(),
}));

const { writeWorkspaceAuditLog } = vi.hoisted(() => ({
  writeWorkspaceAuditLog: vi.fn(),
}));

const { createMentionNotifications } = vi.hoisted(() => ({
  createMentionNotifications: vi.fn(),
}));

const prismaMocks = vi.hoisted(() => ({
  boardItemFindFirst: vi.fn(),
  boardItemUpdate: vi.fn(),
  boardItemAggregate: vi.fn(),
  boardGroupFindFirst: vi.fn(),
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
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    boardItem: {
      findFirst: prismaMocks.boardItemFindFirst,
      update: prismaMocks.boardItemUpdate,
      aggregate: prismaMocks.boardItemAggregate,
    },
    boardGroup: {
      findFirst: prismaMocks.boardGroupFindFirst,
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

describe("PATCH /api/boards/[boardId]/items/[itemId]", () => {
  it("writes workspace audit log on item update", async () => {
    getBoardAccess.mockResolvedValueOnce({
      status: "ok",
      userId: "user_1",
      role: "MEMBER",
    });
    canWriteBoard.mockReturnValueOnce(true);
    prismaMocks.boardItemFindFirst.mockResolvedValueOnce({
      id: "item_1",
      name: "Old name",
      groupId: "group_1",
      board: {
        workspaceId: "workspace_1",
      },
    });
    prismaMocks.boardItemUpdate.mockResolvedValueOnce({
      id: "item_1",
      name: "New name",
      groupId: "group_1",
    });

    const response = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({ name: "New name" }),
      }),
      {
        params: Promise.resolve({ boardId: "board_1", itemId: "item_1" }),
      },
    );

    expect(response.status).toBe(200);
    expect(writeWorkspaceAuditLog).toHaveBeenCalledTimes(1);
    expect(createMentionNotifications).toHaveBeenCalledTimes(1);
    expect(writeWorkspaceAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace_1",
        action: "board_item_updated",
        entityType: "BoardItem",
        entityId: "item_1",
      }),
    );
  });
});
