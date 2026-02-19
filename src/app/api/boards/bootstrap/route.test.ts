/** @vitest-environment node */

import { GET } from "@/app/api/boards/bootstrap/route";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { ensureStageOneBoard } = vi.hoisted(() => ({
  ensureStageOneBoard: vi.fn(),
}));

const { getAuthenticatedAppUser } = vi.hoisted(() => ({
  getAuthenticatedAppUser: vi.fn(),
}));

const telemetryMocks = vi.hoisted(() => ({
  track: vi.fn(),
  identify: vi.fn(),
  captureException: vi.fn(),
}));

vi.mock("@/lib/stage1/bootstrap", () => ({
  ensureStageOneBoard,
}));

vi.mock("@/lib/auth/session", () => ({
  getAuthenticatedAppUser,
}));

vi.mock("@/lib/observability", () => ({
  getTelemetryClient: () => telemetryMocks,
}));

describe("GET /api/boards/bootstrap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    getAuthenticatedAppUser.mockResolvedValueOnce(null);

    const response = await GET(new Request("http://localhost/api/boards/bootstrap"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ message: "Unauthorized" });
  });

  it("returns snapshot payload for default request", async () => {
    getAuthenticatedAppUser.mockResolvedValueOnce({ appUserId: "user_1" });
    ensureStageOneBoard.mockResolvedValueOnce({
      boardId: "board_1",
      sessionUserId: "user_1",
      pageInfo: null,
      snapshot: {
        workspaceId: "workspace_1",
        boardId: "board_1",
        boardName: "Team board",
        views: [],
        columns: [],
        groups: [],
        members: [],
      },
    });

    const response = await GET(new Request("http://localhost/api/boards/bootstrap"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      workspaceId: "workspace_1",
      boardId: "board_1",
      boardName: "Team board",
      views: [],
      columns: [],
      groups: [],
      members: [],
    });
    expect(ensureStageOneBoard).toHaveBeenCalledWith("user_1", undefined);
  });

  it("returns snapshot + page info when pagination params are provided", async () => {
    getAuthenticatedAppUser.mockResolvedValueOnce({ appUserId: "user_1" });
    ensureStageOneBoard.mockResolvedValueOnce({
      boardId: "board_1",
      sessionUserId: "user_1",
      pageInfo: {
        itemOffset: 50,
        itemLimit: 100,
        returnedItems: 100,
        totalItems: 500,
        hasMore: true,
      },
      snapshot: {
        workspaceId: "workspace_1",
        boardId: "board_1",
        boardName: "Team board",
        views: [],
        columns: [],
        groups: [],
        members: [],
      },
    });

    const response = await GET(
      new Request("http://localhost/api/boards/bootstrap?itemOffset=50&itemLimit=100"),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      snapshot: {
        workspaceId: "workspace_1",
        boardId: "board_1",
        boardName: "Team board",
        views: [],
        columns: [],
        groups: [],
        members: [],
      },
      pageInfo: {
        itemOffset: 50,
        itemLimit: 100,
        returnedItems: 100,
        totalItems: 500,
        hasMore: true,
      },
    });
    expect(ensureStageOneBoard).toHaveBeenCalledWith("user_1", {
      itemOffset: 50,
      itemLimit: 100,
    });
    expect(response.headers.get("x-stage3-page-offset")).toBe("50");
    expect(response.headers.get("x-stage3-page-limit")).toBe("100");
    expect(response.headers.get("x-stage3-page-returned")).toBe("100");
    expect(response.headers.get("x-stage3-page-total")).toBe("500");
    expect(response.headers.get("x-stage3-page-has-more")).toBe("true");
    expect(Number(response.headers.get("x-stage3-payload-bytes"))).toBeGreaterThan(0);
    expect(Number(response.headers.get("x-stage3-duration-ms"))).toBeGreaterThanOrEqual(0);
    expect(response.headers.get("server-timing")).toContain("stage3-pagination;dur=");
    expect(telemetryMocks.track).toHaveBeenCalledWith(
      "stage3_pagination_served",
      expect.objectContaining({
        route: "/api/boards/bootstrap",
        boardId: "board_1",
        userId: "user_1",
        itemOffset: 50,
        itemLimit: 100,
        returnedItems: 100,
        totalItems: 500,
        hasMore: true,
      }),
    );
  });

  it("returns 400 when pagination query is invalid", async () => {
    getAuthenticatedAppUser.mockResolvedValueOnce({ appUserId: "user_1" });

    const response = await GET(
      new Request("http://localhost/api/boards/bootstrap?itemOffset=-1&itemLimit=abc"),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ message: "Invalid pagination query" });
  });
});
