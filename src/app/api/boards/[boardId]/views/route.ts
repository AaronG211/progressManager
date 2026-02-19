import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getTelemetryClient } from "@/lib/observability";
import { getBoardAccess } from "@/lib/stage1/route-utils";
import type { StageBoardView, StageBoardViewConfig } from "@/lib/stage1/types";

const telemetry = getTelemetryClient();

type RouteContext = {
  params: Promise<{ boardId: string }>;
};

function toViewSummary(view: {
  id: string;
  name: string;
  type: StageBoardView["type"];
  position: number;
  config: Prisma.JsonValue | null;
}): StageBoardView {
  const config =
    view.config && typeof view.config === "object" && !Array.isArray(view.config)
      ? (view.config as StageBoardViewConfig)
      : null;

  return {
    id: view.id,
    name: view.name,
    type: view.type,
    position: view.position,
    config,
  };
}

export async function GET(_request: Request, context: RouteContext) {
  const { boardId } = await context.params;
  const access = await getBoardAccess(boardId);

  if (access.status === "unauthenticated") {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  if (access.status === "not_found") {
    return NextResponse.json({ message: "Board not found" }, { status: 404 });
  }

  try {
    const views = await prisma.boardView.findMany({
      where: {
        boardId,
      },
      orderBy: {
        position: "asc",
      },
      select: {
        id: true,
        name: true,
        type: true,
        position: true,
        config: true,
      },
    });

    return NextResponse.json({ views: views.map((view) => toViewSummary(view)) });
  } catch (error: unknown) {
    telemetry.captureException(error, {
      route: "/api/boards/[boardId]/views",
      boardId,
      userId: access.userId,
    });

    return NextResponse.json({ message: "Unable to load board views" }, { status: 500 });
  }
}
