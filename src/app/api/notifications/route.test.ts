/** @vitest-environment node */

import { GET } from "@/app/api/notifications/route";
import { describe, expect, it, vi } from "vitest";

const { getAuthenticatedAppUser } = vi.hoisted(() => ({
  getAuthenticatedAppUser: vi.fn(),
}));

const prismaMocks = vi.hoisted(() => ({
  findMany: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  getAuthenticatedAppUser,
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    workspaceNotification: {
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

describe("GET /api/notifications", () => {
  it("returns 401 when not authenticated", async () => {
    getAuthenticatedAppUser.mockResolvedValueOnce(null);

    const response = await GET(new Request("http://localhost/api/notifications"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ message: "Unauthorized" });
  });

  it("returns notifications for current user", async () => {
    getAuthenticatedAppUser.mockResolvedValueOnce({
      appUserId: "user_1",
      email: "user@example.com",
      name: null,
      supabaseUserId: "supabase_1",
    });
    prismaMocks.findMany.mockResolvedValueOnce([
      {
        id: "notif_1",
        workspaceId: "workspace_1",
        type: "MENTION",
        title: "You were mentioned",
        message: "Mentioned in Notes: please check this",
        entityType: "BoardCellValue",
        entityId: "value_1",
        readAt: null,
        createdAt: new Date("2026-02-18T10:00:00.000Z"),
        actor: {
          email: "actor@example.com",
          name: "Actor",
        },
      },
    ]);

    const response = await GET(new Request("http://localhost/api/notifications?limit=10"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      notifications: [
        {
          id: "notif_1",
          workspaceId: "workspace_1",
          type: "MENTION",
          title: "You were mentioned",
          message: "Mentioned in Notes: please check this",
          entityType: "BoardCellValue",
          entityId: "value_1",
          actorLabel: "Actor",
          readAt: null,
          createdAt: "2026-02-18T10:00:00.000Z",
        },
      ],
    });
  });
});
