import { prisma } from "@/lib/db/prisma";
import { getTelemetryClient } from "@/lib/observability";
import { canWriteBoard, getBoardAccess } from "@/lib/stage1/route-utils";
import { writeWorkspaceAuditLog } from "@/lib/stage2/audit";
import { z } from "zod";
import { NextResponse } from "next/server";

const telemetry = getTelemetryClient();

const reorderColumnsSchema = z.object({
  columnIds: z.array(z.string().cuid()).min(1),
});

type RouteContext = {
  params: Promise<{ boardId: string }>;
};

function hasSameIds(a: string[], b: string[]): boolean {
  if (a.length !== b.length) {
    return false;
  }

  const aSet = new Set(a);
  const bSet = new Set(b);

  if (aSet.size !== bSet.size) {
    return false;
  }

  for (const id of aSet) {
    if (!bSet.has(id)) {
      return false;
    }
  }

  return true;
}

export async function PATCH(request: Request, context: RouteContext) {
  const { boardId } = await context.params;
  const access = await getBoardAccess(boardId);

  if (access.status === "unauthenticated") {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  if (access.status === "not_found") {
    return NextResponse.json({ message: "Board not found" }, { status: 404 });
  }

  if (!canWriteBoard(access.role)) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const userId = access.userId;
  let payload: z.infer<typeof reorderColumnsSchema>;

  try {
    payload = reorderColumnsSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ message: "Invalid payload" }, { status: 400 });
  }

  try {
    const [board, existingColumns] = await Promise.all([
      prisma.board.findUnique({
        where: {
          id: boardId,
        },
        select: {
          workspaceId: true,
        },
      }),
      prisma.boardColumn.findMany({
        where: {
          boardId,
        },
        select: {
          id: true,
          name: true,
          position: true,
        },
        orderBy: {
          position: "asc",
        },
      }),
    ]);

    if (!board) {
      return NextResponse.json({ message: "Board not found" }, { status: 404 });
    }

    const existingIds = existingColumns.map((column) => column.id);

    if (!hasSameIds(existingIds, payload.columnIds)) {
      return NextResponse.json({ message: "Column order payload does not match board columns" }, { status: 400 });
    }

    await prisma.$transaction(async (tx) => {
      await tx.boardColumn.updateMany({
        where: {
          boardId,
        },
        data: {
          position: {
            increment: 1_000,
          },
        },
      });

      for (const [position, columnId] of payload.columnIds.entries()) {
        await tx.boardColumn.update({
          where: {
            id: columnId,
          },
          data: {
            position,
          },
        });
      }
    });

    await writeWorkspaceAuditLog({
      workspaceId: board.workspaceId,
      actorUserId: userId,
      action: "board_columns_reordered",
      entityType: "Board",
      entityId: boardId,
      details: {
        boardId,
        previousOrder: existingColumns.map((column) => ({
          id: column.id,
          name: column.name,
          position: column.position,
        })),
        nextOrder: payload.columnIds,
      },
    });

    telemetry.track("stage1_columns_reordered", {
      boardId,
      userId,
      columnCount: payload.columnIds.length,
    });

    return NextResponse.json({
      columnIds: payload.columnIds,
    });
  } catch (error: unknown) {
    telemetry.captureException(error, {
      route: "/api/boards/[boardId]/columns/reorder",
      boardId,
      userId,
    });

    return NextResponse.json({ message: "Unable to reorder columns" }, { status: 500 });
  }
}
