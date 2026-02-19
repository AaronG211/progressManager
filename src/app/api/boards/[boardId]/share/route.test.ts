/** @vitest-environment node */

import { GET, PATCH } from "@/app/api/boards/[boardId]/share/route";
import { describe, expect, it, vi } from "vitest";

const { getBoardAccess, canWriteBoard } = vi.hoisted(() => ({
  getBoardAccess: vi.fn(),
  canWriteBoard: vi.fn(),
}));

const { canManageWorkspace } = vi.hoisted(() => ({
  canManageWorkspace: vi.fn(),
}));

const { writeWorkspaceAuditLog } = vi.hoisted(() => ({
  writeWorkspaceAuditLog: vi.fn(),
}));

const prismaMocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/lib/stage1/route-utils", () => ({
  getBoardAccess,
  canWriteBoard,
}));

vi.mock("@/lib/stage2/workspace-access", () => ({
  canManageWorkspace,
}));

vi.mock("@/lib/stage2/audit", () => ({
  writeWorkspaceAuditLog,
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    board: {
      findUnique: prismaMocks.findUnique,
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

const BOARD_ID = "board_1";

describe("/api/boards/[boardId]/share", () => {
  it("returns 401 when user is unauthenticated", async () => {
    getBoardAccess.mockResolvedValueOnce({ status: "unauthenticated" });

    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ boardId: BOARD_ID }),
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ message: "Unauthorized" });
  });

  it("returns share settings for workspace members", async () => {
    getBoardAccess.mockResolvedValueOnce({
      status: "ok",
      userId: "user_1",
      role: "VIEWER",
    });
    canWriteBoard.mockReturnValueOnce(false);
    canManageWorkspace.mockReturnValueOnce(false);
    prismaMocks.findUnique.mockResolvedValueOnce({
      isPrivate: false,
      shareToken: "share-token-1",
    });

    const response = await GET(new Request("https://app.example.com/api/boards/board_1/share"), {
      params: Promise.resolve({ boardId: BOARD_ID }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      role: "VIEWER",
      canWrite: false,
      canManage: false,
      isPrivate: false,
      shareUrl: "https://app.example.com/share/share-token-1",
    });
  });

  it("returns 403 on PATCH when user cannot manage workspace", async () => {
    getBoardAccess.mockResolvedValueOnce({
      status: "ok",
      userId: "user_1",
      role: "MEMBER",
    });
    canManageWorkspace.mockReturnValueOnce(false);

    const response = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({ isPrivate: true }),
      }),
      {
        params: Promise.resolve({ boardId: BOARD_ID }),
      },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ message: "Forbidden" });
  });

  it("enables share link for manager and writes audit log", async () => {
    getBoardAccess.mockResolvedValueOnce({
      status: "ok",
      userId: "user_1",
      role: "OWNER",
    });
    canWriteBoard.mockReturnValueOnce(true);
    canManageWorkspace.mockReturnValue(true);
    prismaMocks.findUnique.mockResolvedValueOnce({
      id: BOARD_ID,
      workspaceId: "workspace_1",
      isPrivate: false,
      shareToken: null,
    });
    prismaMocks.update.mockResolvedValueOnce({
      isPrivate: false,
      shareToken: "generated-share-token",
    });

    const response = await PATCH(
      new Request("https://app.example.com/api/boards/board_1/share", {
        method: "PATCH",
        body: JSON.stringify({ shareLinkEnabled: true }),
      }),
      {
        params: Promise.resolve({ boardId: BOARD_ID }),
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      role: "OWNER",
      canWrite: true,
      canManage: true,
      isPrivate: false,
      shareUrl: "https://app.example.com/share/generated-share-token",
    });

    expect(prismaMocks.update).toHaveBeenCalledTimes(1);
    expect(prismaMocks.update.mock.calls[0]?.[0]?.data?.shareToken).toEqual(expect.any(String));
    expect(writeWorkspaceAuditLog).toHaveBeenCalledTimes(1);
  });
});
