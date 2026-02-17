import { ensureStageOneBoard } from "@/lib/stage1/bootstrap";
import { getAuthenticatedAppUser } from "@/lib/auth/session";
import { getTelemetryClient } from "@/lib/observability";
import { NextResponse } from "next/server";

const telemetry = getTelemetryClient();

export async function GET() {
  try {
    const authUser = await getAuthenticatedAppUser();

    if (!authUser) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { snapshot } = await ensureStageOneBoard(authUser.appUserId);
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
