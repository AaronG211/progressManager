import { ensureStageOneBoard } from "@/lib/stage1/bootstrap";
import { getTelemetryClient } from "@/lib/observability";
import { NextResponse } from "next/server";

const telemetry = getTelemetryClient();

export async function GET() {
  try {
    const { snapshot } = await ensureStageOneBoard();
    return NextResponse.json(snapshot);
  } catch (error: unknown) {
    telemetry.captureException(error, {
      route: "/api/boards/bootstrap",
    });

    return NextResponse.json(
      {
        message: "Unable to bootstrap board",
      },
      { status: 500 },
    );
  }
}
