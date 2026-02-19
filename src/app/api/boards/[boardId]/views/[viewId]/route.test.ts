/** @vitest-environment node */

import { PATCH } from "@/app/api/boards/[boardId]/views/[viewId]/route";
import { describe, expect, it, vi } from "vitest";

const { getBoardAccess, canWriteBoard } = vi.hoisted(() => ({
  getBoardAccess: vi.fn(),
  canWriteBoard: vi.fn(),
}));

const { writeWorkspaceAuditLog } = vi.hoisted(() => ({
  writeWorkspaceAuditLog: vi.fn(),
}));

const prismaMocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/lib/stage1/route-utils", () => ({
  getBoardAccess,
  canWriteBoard,
}));

vi.mock("@/lib/stage2/audit", () => ({
  writeWorkspaceAuditLog,
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    boardView: {
      findFirst: prismaMocks.findFirst,
      update: prismaMocks.update,
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

describe("PATCH /api/boards/[boardId]/views/[viewId]", () => {
  it("returns 403 for read-only role", async () => {
    getBoardAccess.mockResolvedValueOnce({
      status: "ok",
      userId: "user_1",
      role: "VIEWER",
    });
    canWriteBoard.mockReturnValueOnce(false);

    const response = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({ config: { sortBy: "name_asc" } }),
      }),
      {
        params: Promise.resolve({ boardId: "board_1", viewId: "view_1" }),
      },
    );

    expect(response.status).toBe(403);
  });

  it("updates view config and writes audit log", async () => {
    getBoardAccess.mockResolvedValueOnce({
      status: "ok",
      userId: "user_1",
      role: "MEMBER",
    });
    canWriteBoard.mockReturnValueOnce(true);
    prismaMocks.findFirst.mockResolvedValueOnce({
      id: "view_1",
      name: "Table",
      config: null,
      board: {
        workspaceId: "workspace_1",
      },
    });
    prismaMocks.update.mockResolvedValueOnce({
      id: "view_1",
      name: "Table",
      type: "TABLE",
      position: 0,
      config: {
        sortBy: "number_desc",
        numberMin: 2,
        numberMax: 10,
        tagValue: "MVP",
        checkboxValue: true,
        timelineStartColumnId: "cjt9lqz5o0000qzrmn831i7rn",
        timelineEndColumnId: "cjt9lqz5o0001qzrmn831i7ro",
      },
    });

    const response = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({
          config: {
            sortBy: "number_desc",
            numberMin: 2,
            numberMax: 10,
            tagValue: "MVP",
            checkboxValue: true,
            timelineStartColumnId: "cjt9lqz5o0000qzrmn831i7rn",
            timelineEndColumnId: "cjt9lqz5o0001qzrmn831i7ro",
          },
        }),
      }),
      {
        params: Promise.resolve({ boardId: "board_1", viewId: "view_1" }),
      },
    );

    expect(response.status).toBe(200);
    expect(writeWorkspaceAuditLog).toHaveBeenCalledTimes(1);
    await expect(response.json()).resolves.toEqual({
      id: "view_1",
      name: "Table",
      type: "TABLE",
      position: 0,
      config: {
        sortBy: "number_desc",
        numberMin: 2,
        numberMax: 10,
        tagValue: "MVP",
        checkboxValue: true,
        timelineStartColumnId: "cjt9lqz5o0000qzrmn831i7rn",
        timelineEndColumnId: "cjt9lqz5o0001qzrmn831i7ro",
      },
    });
  });
});
