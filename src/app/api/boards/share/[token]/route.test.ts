/** @vitest-environment node */

import { GET } from "@/app/api/boards/share/[token]/route";
import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
}));

const { getBoardSnapshotWithPageInfo } = vi.hoisted(() => ({
  getBoardSnapshotWithPageInfo: vi.fn(),
}));

const telemetryMocks = vi.hoisted(() => ({
  track: vi.fn(),
  identify: vi.fn(),
  captureException: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    board: {
      findFirst: prismaMocks.findFirst,
    },
  },
}));

vi.mock("@/lib/stage1/board-query", () => ({
  getBoardSnapshotWithPageInfo,
}));

vi.mock("@/lib/observability", () => ({
  getTelemetryClient: () => telemetryMocks,
}));

describe("GET /api/boards/share/[token]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 for invalid pagination query params", async () => {
    const response = await GET(
      new Request("http://localhost/api/boards/share/token_1?itemOffset=-1"),
      {
        params: Promise.resolve({ token: "token_1" }),
      },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ message: "Invalid pagination query" });
  });

  it("returns 404 when token is not valid", async () => {
    prismaMocks.findFirst.mockResolvedValueOnce(null);

    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ token: "invalid-token" }),
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ message: "Share link not found" });
  });

  it("returns shared board snapshot", async () => {
    prismaMocks.findFirst.mockResolvedValueOnce({ id: "board_1" });
    getBoardSnapshotWithPageInfo.mockResolvedValueOnce({
      snapshot: {
        workspaceId: "workspace_1",
        boardId: "board_1",
        boardName: "Shared board",
        views: [],
        columns: [],
        groups: [],
        members: [],
      },
      pageInfo: null,
    });

    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ token: "token_1" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      workspaceId: "workspace_1",
      boardId: "board_1",
      boardName: "Shared board",
      views: [],
      columns: [],
      groups: [],
      members: [],
    });
  });

  it("returns snapshot envelope when pagination query params are provided", async () => {
    prismaMocks.findFirst.mockResolvedValueOnce({ id: "board_1" });
    getBoardSnapshotWithPageInfo.mockResolvedValueOnce({
      snapshot: {
        workspaceId: "workspace_1",
        boardId: "board_1",
        boardName: "Shared board",
        views: [],
        columns: [],
        groups: [],
        members: [],
      },
      pageInfo: {
        itemOffset: 0,
        itemLimit: 100,
        returnedItems: 100,
        totalItems: 250,
        hasMore: true,
      },
    });

    const response = await GET(
      new Request("http://localhost/api/boards/share/token_1?itemOffset=0&itemLimit=100"),
      {
        params: Promise.resolve({ token: "token_1" }),
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      snapshot: {
        workspaceId: "workspace_1",
        boardId: "board_1",
        boardName: "Shared board",
        views: [],
        columns: [],
        groups: [],
        members: [],
      },
      pageInfo: {
        itemOffset: 0,
        itemLimit: 100,
        returnedItems: 100,
        totalItems: 250,
        hasMore: true,
      },
    });
    expect(response.headers.get("x-stage3-page-offset")).toBe("0");
    expect(response.headers.get("x-stage3-page-limit")).toBe("100");
    expect(response.headers.get("x-stage3-page-returned")).toBe("100");
    expect(response.headers.get("x-stage3-page-total")).toBe("250");
    expect(response.headers.get("x-stage3-page-has-more")).toBe("true");
    expect(Number(response.headers.get("x-stage3-payload-bytes"))).toBeGreaterThan(0);
    expect(Number(response.headers.get("x-stage3-duration-ms"))).toBeGreaterThanOrEqual(0);
    expect(response.headers.get("server-timing")).toContain("stage3-pagination;dur=");
    expect(telemetryMocks.track).toHaveBeenCalledWith(
      "stage3_pagination_served",
      expect.objectContaining({
        route: "/api/boards/share/[token]",
        boardId: "board_1",
        itemOffset: 0,
        itemLimit: 100,
        returnedItems: 100,
        totalItems: 250,
        hasMore: true,
      }),
    );
  });
});
