import { parseServerEnv } from "@/lib/env/server";
import { getTelemetryClient } from "@/lib/observability";
import { NextRequest, NextResponse } from "next/server";

const telemetry = getTelemetryClient();

export async function GET(request: NextRequest): Promise<NextResponse> {
  const timestamp = new Date().toISOString();

  const env = parseServerEnv();
  const version = env.success ? env.data.APP_VERSION : "0.1.0";

  try {
    if (request.nextUrl.searchParams.get("mode") === "error") {
      throw new Error("Synthetic health route failure");
    }

    return NextResponse.json({
      status: "ok",
      timestamp,
      version,
    });
  } catch (error: unknown) {
    telemetry.captureException(error, {
      route: "/api/health",
      mode: request.nextUrl.searchParams.get("mode") ?? "normal",
    });

    return NextResponse.json(
      {
        status: "error",
        timestamp,
        version,
      },
      { status: 500 },
    );
  }
}
