/** @vitest-environment node */

import { GET } from "@/app/api/ready/route";
import { describe, expect, it, vi } from "vitest";

const { checkDatabaseReadiness } = vi.hoisted(() => ({
  checkDatabaseReadiness: vi.fn(),
}));

vi.mock("@/lib/db/readiness", () => ({
  checkDatabaseReadiness,
}));

describe("GET /api/ready", () => {
  it("returns ready when db check passes", async () => {
    checkDatabaseReadiness.mockResolvedValueOnce({ ready: true });

    const response = await GET();
    const payload = (await response.json()) as { status: string };

    expect(response.status).toBe(200);
    expect(payload.status).toBe("ready");
  });

  it("returns not_ready when db check fails", async () => {
    checkDatabaseReadiness.mockResolvedValueOnce({
      ready: false,
      reason: "database_unreachable",
    });

    const response = await GET();
    const payload = (await response.json()) as {
      status: string;
      reason: string;
    };

    expect(response.status).toBe(503);
    expect(payload.status).toBe("not_ready");
    expect(payload.reason).toBe("database_unreachable");
  });
});
