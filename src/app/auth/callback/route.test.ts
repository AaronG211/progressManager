/** @vitest-environment node */

import { GET } from "@/app/auth/callback/route";
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

const { createSupabaseServerClient } = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
}));

const { exchangeCodeForSession } = vi.hoisted(() => ({
  exchangeCodeForSession: vi.fn(),
}));

vi.mock("@/lib/auth/supabase/server", () => ({
  createSupabaseServerClient,
}));

vi.mock("@/lib/observability", () => ({
  getTelemetryClient: () => ({
    track: vi.fn(),
    identify: vi.fn(),
    captureException: vi.fn(),
  }),
}));

describe("GET /auth/callback", () => {
  it("redirects to next path when exchange succeeds", async () => {
    createSupabaseServerClient.mockResolvedValueOnce({
      auth: {
        exchangeCodeForSession,
      },
    });
    exchangeCodeForSession.mockResolvedValueOnce({
      error: null,
    });

    const request = new NextRequest(
      "http://localhost:3000/auth/callback?code=abc123&next=/",
    );
    const response = await GET(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost:3000/");
  });

  it("redirects to login with error when exchange fails", async () => {
    createSupabaseServerClient.mockResolvedValueOnce({
      auth: {
        exchangeCodeForSession,
      },
    });
    exchangeCodeForSession.mockResolvedValueOnce({
      error: new Error("bad_code"),
    });

    const request = new NextRequest(
      "http://localhost:3000/auth/callback?code=bad&next=/",
    );
    const response = await GET(request);
    const location = response.headers.get("location");

    expect(response.status).toBe(307);
    expect(location).toContain("http://localhost:3000/login");
    expect(location).toContain("error=auth_callback_failed");
  });
});
