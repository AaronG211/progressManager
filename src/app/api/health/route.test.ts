/** @vitest-environment node */

import { GET } from "@/app/api/health/route";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

describe("GET /api/health", () => {
  it("returns ok payload", async () => {
    const request = new NextRequest("http://localhost:3000/api/health");
    const response = await GET(request);

    expect(response.status).toBe(200);

    const payload = (await response.json()) as {
      status: string;
      timestamp: string;
      version: string;
    };

    expect(payload.status).toBe("ok");
    expect(payload.timestamp).toBeTypeOf("string");
    expect(payload.version).toBeTypeOf("string");
  });

  it("returns 500 in synthetic error mode", async () => {
    const request = new NextRequest("http://localhost:3000/api/health?mode=error");
    const response = await GET(request);

    expect(response.status).toBe(500);

    const payload = (await response.json()) as {
      status: string;
    };

    expect(payload.status).toBe("error");
  });
});
