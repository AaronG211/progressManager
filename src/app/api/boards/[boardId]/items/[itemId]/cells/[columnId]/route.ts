import { BoardColumnType } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getTelemetryClient } from "@/lib/observability";
import { assertBoardAccess } from "@/lib/stage1/route-utils";
import { z } from "zod";
import { NextResponse } from "next/server";

const telemetry = getTelemetryClient();

const updateCellSchema = z
  .object({
    textValue: z.string().max(4_000).nullable().optional(),
    statusValue: z.string().max(80).nullable().optional(),
    personId: z.string().cuid().nullable().optional(),
    dateValue: z.string().max(80).nullable().optional(),
  })
  .refine(
    (value) =>
      value.textValue !== undefined ||
      value.statusValue !== undefined ||
      value.personId !== undefined ||
      value.dateValue !== undefined,
    {
      message: "Nothing to update",
    },
  );

type RouteContext = {
  params: Promise<{ boardId: string; itemId: string; columnId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const { boardId, itemId, columnId } = await context.params;
  const userId = await assertBoardAccess(boardId);

  if (!userId) {
    return NextResponse.json({ message: "Board not found" }, { status: 404 });
  }

  let payload: z.infer<typeof updateCellSchema>;

  try {
    payload = updateCellSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ message: "Invalid payload" }, { status: 400 });
  }

  try {
    const [item, column] = await Promise.all([
      prisma.boardItem.findFirst({ where: { id: itemId, boardId }, select: { id: true } }),
      prisma.boardColumn.findFirst({ where: { id: columnId, boardId } }),
    ]);

    if (!item) {
      return NextResponse.json({ message: "Item not found" }, { status: 404 });
    }

    if (!column) {
      return NextResponse.json({ message: "Column not found" }, { status: 404 });
    }

    const updateData: {
      textValue?: string | null;
      statusValue?: string | null;
      personId?: string | null;
      dateValue?: Date | null;
      updatedById: string;
    } = {
      updatedById: userId,
    };

    if (column.type === BoardColumnType.TEXT && payload.textValue !== undefined) {
      updateData.textValue = payload.textValue;
    }

    if (column.type === BoardColumnType.STATUS && payload.statusValue !== undefined) {
      updateData.statusValue = payload.statusValue;
    }

    if (column.type === BoardColumnType.PERSON && payload.personId !== undefined) {
      updateData.personId = payload.personId;
    }

    if (column.type === BoardColumnType.DATE && payload.dateValue !== undefined) {
      if (payload.dateValue === null || payload.dateValue === "") {
        updateData.dateValue = null;
      } else {
        const parsedDate = new Date(payload.dateValue);

        if (Number.isNaN(parsedDate.getTime())) {
          return NextResponse.json({ message: "Invalid date value" }, { status: 400 });
        }

        updateData.dateValue = parsedDate;
      }
    }

    const value = await prisma.boardCellValue.upsert({
      where: {
        itemId_columnId: {
          itemId,
          columnId,
        },
      },
      create: {
        itemId,
        columnId,
        ...updateData,
      },
      update: updateData,
    });

    telemetry.track("stage1_cell_updated", {
      boardId,
      itemId,
      columnId,
      userId,
    });

    return NextResponse.json({
      id: value.id,
      itemId: value.itemId,
      columnId: value.columnId,
      textValue: value.textValue,
      statusValue: value.statusValue,
      personId: value.personId,
      dateValue: value.dateValue ? value.dateValue.toISOString() : null,
    });
  } catch (error: unknown) {
    telemetry.captureException(error, {
      route: "/api/boards/[boardId]/items/[itemId]/cells/[columnId]",
      boardId,
      itemId,
      columnId,
      userId,
    });

    return NextResponse.json({ message: "Unable to update cell" }, { status: 500 });
  }
}
