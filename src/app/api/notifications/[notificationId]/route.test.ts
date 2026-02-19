/** @vitest-environment node */

import { PATCH } from "@/app/api/notifications/[notificationId]/route";
import { describe, expect, it, vi } from "vitest";

const { getAuthenticatedAppUser } = vi.hoisted(() => ({
  getAuthenticatedAppUser: vi.fn(),
}));

const prismaMocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  getAuthenticatedAppUser,
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    workspaceNotification: {
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

describe("PATCH /api/notifications/[notificationId]", () => {
  it("returns 404 when notification is missing", async () => {
    getAuthenticatedAppUser.mockResolvedValueOnce({
      appUserId: "user_1",
      email: "user@example.com",
      name: null,
      supabaseUserId: "supabase_1",
    });
    prismaMocks.findFirst.mockResolvedValueOnce(null);

    const response = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({ read: true }),
      }),
      {
        params: Promise.resolve({ notificationId: "notif_1" }),
      },
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ message: "Notification not found" });
  });

  it("marks notification as read", async () => {
    getAuthenticatedAppUser.mockResolvedValueOnce({
      appUserId: "user_1",
      email: "user@example.com",
      name: null,
      supabaseUserId: "supabase_1",
    });
    prismaMocks.findFirst.mockResolvedValueOnce({ id: "notif_1" });
    prismaMocks.update.mockResolvedValueOnce({
      id: "notif_1",
      readAt: new Date("2026-02-18T10:02:00.000Z"),
    });

    const response = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({ read: true }),
      }),
      {
        params: Promise.resolve({ notificationId: "notif_1" }),
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      id: "notif_1",
      readAt: "2026-02-18T10:02:00.000Z",
    });
  });
});
