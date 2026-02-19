import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getTelemetryClient } from "@/lib/observability";
import { canWriteBoard, getBoardAccess } from "@/lib/stage1/route-utils";
import type { StageBoardViewConfig } from "@/lib/stage1/types";
import { writeWorkspaceAuditLog } from "@/lib/stage2/audit";

const telemetry = getTelemetryClient();

const viewConfigSchema = z.object({
  statusValue: z.string().trim().min(1).max(80).nullable().optional(),
  personId: z.string().cuid().nullable().optional(),
  dateFrom: z.string().max(80).nullable().optional(),
  dateTo: z.string().max(80).nullable().optional(),
  timelineStartColumnId: z.string().cuid().nullable().optional(),
  timelineEndColumnId: z.string().cuid().nullable().optional(),
  numberMin: z.number().finite().nullable().optional(),
  numberMax: z.number().finite().nullable().optional(),
  tagValue: z.string().trim().min(1).max(80).nullable().optional(),
  checkboxValue: z.boolean().nullable().optional(),
  urlQuery: z.string().trim().min(1).max(512).nullable().optional(),
  sortBy: z
    .enum([
      "manual",
      "name_asc",
      "name_desc",
      "date_asc",
      "date_desc",
      "number_asc",
      "number_desc",
    ])
    .optional(),
});

const updateViewSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    config: viewConfigSchema.nullable().optional(),
  })
  .refine((value) => value.name !== undefined || value.config !== undefined, {
    message: "Nothing to update",
  });

type RouteContext = {
  params: Promise<{ boardId: string; viewId: string }>;
};

function toPrismaViewConfig(
  value: StageBoardViewConfig | null | undefined,
): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return Prisma.JsonNull;
  }

  const normalized: Prisma.JsonObject = {};

  if (value.statusValue !== undefined) {
    normalized.statusValue = value.statusValue;
  }

  if (value.personId !== undefined) {
    normalized.personId = value.personId;
  }

  if (value.dateFrom !== undefined) {
    normalized.dateFrom = value.dateFrom;
  }

  if (value.dateTo !== undefined) {
    normalized.dateTo = value.dateTo;
  }

  if (value.timelineStartColumnId !== undefined) {
    normalized.timelineStartColumnId = value.timelineStartColumnId;
  }

  if (value.timelineEndColumnId !== undefined) {
    normalized.timelineEndColumnId = value.timelineEndColumnId;
  }

  if (value.sortBy !== undefined) {
    normalized.sortBy = value.sortBy;
  }

  if (value.numberMin !== undefined) {
    normalized.numberMin = value.numberMin;
  }

  if (value.numberMax !== undefined) {
    normalized.numberMax = value.numberMax;
  }

  if (value.tagValue !== undefined) {
    normalized.tagValue = value.tagValue;
  }

  if (value.checkboxValue !== undefined) {
    normalized.checkboxValue = value.checkboxValue;
  }

  if (value.urlQuery !== undefined) {
    normalized.urlQuery = value.urlQuery;
  }

  return normalized;
}

export async function PATCH(request: Request, context: RouteContext) {
  const { boardId, viewId } = await context.params;
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

  let payload: z.infer<typeof updateViewSchema>;

  try {
    payload = updateViewSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ message: "Invalid payload" }, { status: 400 });
  }

  try {
    const existingView = await prisma.boardView.findFirst({
      where: {
        id: viewId,
        boardId,
      },
      select: {
        id: true,
        name: true,
        config: true,
        board: {
          select: {
            workspaceId: true,
          },
        },
      },
    });

    if (!existingView) {
      return NextResponse.json({ message: "View not found" }, { status: 404 });
    }

    const updated = await prisma.boardView.update({
      where: {
        id: existingView.id,
      },
      data: {
        name: payload.name,
        config: toPrismaViewConfig(payload.config),
      },
      select: {
        id: true,
        name: true,
        type: true,
        position: true,
        config: true,
      },
    });

    await writeWorkspaceAuditLog({
      workspaceId: existingView.board.workspaceId,
      actorUserId: access.userId,
      action: "board_view_updated",
      entityType: "BoardView",
      entityId: existingView.id,
      details: {
        boardId,
        previousName: existingView.name,
        nextName: updated.name,
      },
    });

    return NextResponse.json(updated);
  } catch (error: unknown) {
    telemetry.captureException(error, {
      route: "/api/boards/[boardId]/views/[viewId]",
      boardId,
      viewId,
      userId: access.userId,
    });

    return NextResponse.json({ message: "Unable to update board view" }, { status: 500 });
  }
}
