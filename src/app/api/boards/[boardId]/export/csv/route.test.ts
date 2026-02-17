/** @vitest-environment node */

import { GET } from "@/app/api/boards/[boardId]/export/csv/route";
import type { StageOneBoardSnapshot } from "@/lib/stage1/types";
import { describe, expect, it, vi } from "vitest";

const { getBoardAccess } = vi.hoisted(() => ({
  getBoardAccess: vi.fn(),
}));

const { getBoardSnapshot } = vi.hoisted(() => ({
  getBoardSnapshot: vi.fn(),
}));

vi.mock("@/lib/stage1/route-utils", () => ({
  getBoardAccess,
}));

vi.mock("@/lib/stage1/board-query", () => ({
  getBoardSnapshot,
}));

vi.mock("@/lib/observability", () => ({
  getTelemetryClient: () => ({
    track: vi.fn(),
    identify: vi.fn(),
    captureException: vi.fn(),
  }),
}));

const snapshotFixture: StageOneBoardSnapshot = {
  workspaceId: "workspace_1",
  boardId: "board_1",
  boardName: "Team Tasks",
  columns: [
    {
      id: "col_notes",
      name: "Notes",
      type: "TEXT",
      position: 0,
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
          name: "Define scope",
          position: 0,
          lastEditedById: null,
          values: [
            {
              id: "value_1",
              itemId: "item_1",
              columnId: "col_notes",
              textValue: "Stage 1 MVP",
              statusValue: null,
              personId: null,
              dateValue: null,
            },
          ],
        },
      ],
    },
  ],
  members: [],
};

describe("GET /api/boards/[boardId]/export/csv", () => {
  it("returns 401 when request is unauthenticated", async () => {
    getBoardAccess.mockResolvedValueOnce({ status: "unauthenticated" });

    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ boardId: "board_1" }),
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      message: "Unauthorized",
    });
  });

  it("returns csv payload when board access succeeds", async () => {
    getBoardAccess.mockResolvedValueOnce({
      status: "ok",
      userId: "user_1",
    });
    getBoardSnapshot.mockResolvedValueOnce(snapshotFixture);

    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ boardId: "board_1" }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/csv");
    expect(response.headers.get("Content-Disposition")).toContain("team-tasks.csv");

    const body = await response.text();

    expect(body).toContain("Group,Item,Notes");
    expect(body).toContain("Backlog,Define scope,Stage 1 MVP");
  });
});
