/** @vitest-environment node */

import { PATCH } from "@/app/api/boards/[boardId]/columns/reorder/route";
import { describe, expect, it, vi } from "vitest";

const { getBoardAccess, canWriteBoard } = vi.hoisted(() => ({
  getBoardAccess: vi.fn(),
  canWriteBoard: vi.fn(),
}));

const { writeWorkspaceAuditLog } = vi.hoisted(() => ({
  writeWorkspaceAuditLog: vi.fn(),
}));

const prismaMocks = vi.hoisted(() => {
  const findUniqueBoard = vi.fn();
  const findMany = vi.fn();
  const updateMany = vi.fn();
  const update = vi.fn();
  const transaction = vi.fn(async (callback: (tx: { boardColumn: { updateMany: typeof updateMany; update: typeof update } }) => unknown) =>
    callback({
      boardColumn: {
        updateMany,
        update,
      },
    }),
  );

  return {
    findUniqueBoard,
    findMany,
    updateMany,
    update,
    transaction,
  };
});

vi.mock("@/lib/stage1/route-utils", () => ({
  getBoardAccess,
  canWriteBoard,
}));

vi.mock("@/lib/stage2/audit", () => ({
  writeWorkspaceAuditLog,
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    board: {
      findUnique: prismaMocks.findUniqueBoard,
    },
    boardColumn: {
      findMany: prismaMocks.findMany,
    },
    $transaction: prismaMocks.transaction,
  },
}));

vi.mock("@/lib/observability", () => ({
  getTelemetryClient: () => ({
    track: vi.fn(),
    identify: vi.fn(),
    captureException: vi.fn(),
  }),
}));

const COLUMN_A = "cm0source00000000000000000";
const COLUMN_B = "cm0target00000000000000000";

describe("PATCH /api/boards/[boardId]/columns/reorder", () => {
  it("returns 401 for unauthenticated requests", async () => {
    getBoardAccess.mockResolvedValueOnce({ status: "unauthenticated" });

    const response = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({ columnIds: [COLUMN_A, COLUMN_B] }),
      }),
      {
        params: Promise.resolve({ boardId: "board_1" }),
      },
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      message: "Unauthorized",
    });
  });

  it("returns 400 when payload ids do not match board columns", async () => {
    getBoardAccess.mockResolvedValueOnce({
      status: "ok",
      userId: "user_1",
      role: "OWNER",
    });
    canWriteBoard.mockReturnValueOnce(true);
    prismaMocks.findUniqueBoard.mockResolvedValueOnce({ workspaceId: "workspace_1" });
    prismaMocks.findMany.mockResolvedValueOnce([{ id: COLUMN_A }, { id: COLUMN_B }]);

    const response = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({ columnIds: [COLUMN_A] }),
      }),
      {
        params: Promise.resolve({ boardId: "board_1" }),
      },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: "Column order payload does not match board columns",
    });
  });

  it("persists reordered positions in a transaction", async () => {
    getBoardAccess.mockResolvedValueOnce({
      status: "ok",
      userId: "user_1",
      role: "OWNER",
    });
    canWriteBoard.mockReturnValueOnce(true);
    prismaMocks.findUniqueBoard.mockResolvedValueOnce({ workspaceId: "workspace_1" });
    prismaMocks.findMany.mockResolvedValueOnce([
      { id: COLUMN_A, name: "A", position: 0 },
      { id: COLUMN_B, name: "B", position: 1 },
    ]);
    prismaMocks.updateMany.mockResolvedValueOnce({ count: 2 });
    prismaMocks.update.mockResolvedValue({ id: COLUMN_A });

    const response = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({ columnIds: [COLUMN_B, COLUMN_A] }),
      }),
      {
        params: Promise.resolve({ boardId: "board_1" }),
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      columnIds: [COLUMN_B, COLUMN_A],
    });
    expect(prismaMocks.transaction).toHaveBeenCalledTimes(1);
    expect(prismaMocks.updateMany).toHaveBeenCalledTimes(1);
    expect(prismaMocks.update).toHaveBeenCalledTimes(2);
    expect(writeWorkspaceAuditLog).toHaveBeenCalledTimes(1);
  });

  it("returns 403 when role is read-only", async () => {
    getBoardAccess.mockResolvedValueOnce({
      status: "ok",
      userId: "user_1",
      role: "VIEWER",
    });
    canWriteBoard.mockReturnValueOnce(false);

    const response = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({ columnIds: [COLUMN_A, COLUMN_B] }),
      }),
      {
        params: Promise.resolve({ boardId: "board_1" }),
      },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      message: "Forbidden",
    });
  });
});
