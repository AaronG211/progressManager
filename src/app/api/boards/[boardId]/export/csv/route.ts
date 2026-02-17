import { getTelemetryClient } from "@/lib/observability";
import { getBoardSnapshot } from "@/lib/stage1/board-query";
import { getBoardAccess } from "@/lib/stage1/route-utils";
import { buildBoardCsv } from "@/lib/stage1/csv";
import { NextResponse } from "next/server";

const telemetry = getTelemetryClient();

type RouteContext = {
  params: Promise<{ boardId: string }>;
};

function toSlug(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "board-export";
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

  const userId = access.userId;

  try {
    const snapshot = await getBoardSnapshot(boardId);

    if (!snapshot) {
      return NextResponse.json({ message: "Board not found" }, { status: 404 });
    }

    const csv = buildBoardCsv(snapshot);
    const fileName = `${toSlug(snapshot.boardName)}.csv`;

    telemetry.track("stage1_csv_exported", {
      boardId,
      userId,
      rowCount: snapshot.groups.reduce((count, group) => count + group.items.length, 0),
    });

    return new NextResponse(`\uFEFF${csv}`, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error: unknown) {
    telemetry.captureException(error, {
      route: "/api/boards/[boardId]/export/csv",
      boardId,
      userId,
    });

    return NextResponse.json({ message: "Unable to export board CSV" }, { status: 500 });
  }
}
