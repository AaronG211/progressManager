import { checkDatabaseReadiness } from "@/lib/db/readiness";
import { getTelemetryClient } from "@/lib/observability";
import { NextResponse } from "next/server";

const telemetry = getTelemetryClient();

export async function GET(): Promise<NextResponse> {
  const readiness = await checkDatabaseReadiness();

  if (readiness.ready) {
    return NextResponse.json({ status: "ready" });
  }

  telemetry.captureException(new Error("Readiness check failed"), {
    route: "/api/ready",
    reason: readiness.reason,
  });

  return NextResponse.json(
    {
      status: "not_ready",
      reason: readiness.reason ?? "unknown",
    },
    { status: 503 },
  );
}
