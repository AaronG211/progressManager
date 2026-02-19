/** @vitest-environment node */

import { GET } from "@/app/api/boards/[boardId]/views/route";
import { describe, expect, it, vi } from "vitest";

const { getBoardAccess } = vi.hoisted(() => ({
  getBoardAccess: vi.fn(),
}));

const prismaMocks = vi.hoisted(() => ({
  findMany: vi.fn(),
}));

vi.mock("@/lib/stage1/route-utils", () => ({
  getBoardAccess,
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    boardView: {
      findMany: prismaMocks.findMany,
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

describe("GET /api/boards/[boardId]/views", () => {
  it("returns 401 when unauthenticated", async () => {
    getBoardAccess.mockResolvedValueOnce({ status: "unauthenticated" });

    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ boardId: "board_1" }),
    });

    expect(response.status).toBe(401);
  });

  it("returns board views", async () => {
    getBoardAccess.mockResolvedValueOnce({
      status: "ok",
      userId: "user_1",
      role: "MEMBER",
    });
    prismaMocks.findMany.mockResolvedValueOnce([
      {
        id: "view_1",
        name: "Table",
        type: "TABLE",
        position: 0,
        config: null,
      },
    ]);

    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ boardId: "board_1" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      views: [
        {
          id: "view_1",
          name: "Table",
          type: "TABLE",
          position: 0,
          config: null,
        },
      ],
    });
  });
});
