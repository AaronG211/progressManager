/** @vitest-environment node */

import { GET, POST } from "@/app/api/workspaces/invites/[token]/accept/route";
import { describe, expect, it, vi } from "vitest";

const { getAuthenticatedAppUser } = vi.hoisted(() => ({
  getAuthenticatedAppUser: vi.fn(),
}));

const { acceptWorkspaceInvite } = vi.hoisted(() => ({
  acceptWorkspaceInvite: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  getAuthenticatedAppUser,
}));

vi.mock("@/lib/stage2/invites", () => ({
  acceptWorkspaceInvite,
}));

vi.mock("@/lib/observability", () => ({
  getTelemetryClient: () => ({
    track: vi.fn(),
    identify: vi.fn(),
    captureException: vi.fn(),
  }),
}));

describe("workspace invite accept route", () => {
  it("returns unauthorized on POST without auth", async () => {
    getAuthenticatedAppUser.mockResolvedValueOnce(null);

    const response = await POST(new Request("http://localhost"), {
      params: Promise.resolve({ token: "a1234567890abcdefghijklmnop" }),
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      message: "Unauthorized",
    });
  });

  it("redirects to home on GET when invite accept succeeds", async () => {
    getAuthenticatedAppUser.mockResolvedValueOnce({
      appUserId: "user_1",
      email: "demo@example.com",
      name: "Demo",
      supabaseUserId: "supabase_1",
    });
    acceptWorkspaceInvite.mockResolvedValueOnce({
      status: "accepted",
      workspaceId: "workspace_1",
    });

    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ token: "a1234567890abcdefghijklmnop" }),
    });

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/");
  });
});
