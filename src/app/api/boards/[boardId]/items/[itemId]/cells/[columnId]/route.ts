import { BoardColumnType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getTelemetryClient } from "@/lib/observability";
import { canWriteBoard, getBoardAccess } from "@/lib/stage1/route-utils";
import { writeWorkspaceAuditLog } from "@/lib/stage2/audit";
import {
  createAssignmentChangeNotifications,
  createMentionNotifications,
} from "@/lib/stage2/notifications";
import { z } from "zod";
import { NextResponse } from "next/server";

const telemetry = getTelemetryClient();

const updateCellSchema = z
  .object({
    textValue: z.string().max(4_000).nullable().optional(),
    statusValue: z.string().max(80).nullable().optional(),
    personId: z.string().cuid().nullable().optional(),
    dateValue: z.string().max(80).nullable().optional(),
    numberValue: z.number().finite().nullable().optional(),
    tagsValue: z.array(z.string().trim().min(1).max(80)).max(30).nullable().optional(),
    checkboxValue: z.boolean().nullable().optional(),
    urlValue: z.string().trim().url().max(2048).nullable().optional(),
  })
  .refine(
    (value) =>
      value.textValue !== undefined ||
      value.statusValue !== undefined ||
      value.personId !== undefined ||
      value.dateValue !== undefined ||
      value.numberValue !== undefined ||
      value.tagsValue !== undefined ||
      value.checkboxValue !== undefined ||
      value.urlValue !== undefined,
    {
      message: "Nothing to update",
    },
  );

type RouteContext = {
  params: Promise<{ boardId: string; itemId: string; columnId: string }>;
};

function normalizeTagsValue(value: Prisma.JsonValue | null): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

export async function PATCH(request: Request, context: RouteContext) {
  const { boardId, itemId, columnId } = await context.params;
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

  let payload: z.infer<typeof updateCellSchema>;

  try {
    payload = updateCellSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ message: "Invalid payload" }, { status: 400 });
  }

  try {
    const [item, column] = await Promise.all([
      prisma.boardItem.findFirst({
        where: { id: itemId, boardId },
        select: { id: true, name: true },
      }),
      prisma.boardColumn.findFirst({
        where: { id: columnId, boardId },
        select: {
          id: true,
          name: true,
          type: true,
          board: {
            select: {
              workspaceId: true,
            },
          },
        },
      }),
    ]);

    if (!item) {
      return NextResponse.json({ message: "Item not found" }, { status: 404 });
    }

    if (!column) {
      return NextResponse.json({ message: "Column not found" }, { status: 404 });
    }

    const existingValue = await prisma.boardCellValue.findUnique({
      where: {
        itemId_columnId: {
          itemId,
          columnId,
        },
      },
      select: {
        textValue: true,
        statusValue: true,
        personId: true,
        dateValue: true,
        numberValue: true,
        tagsValue: true,
        checkboxValue: true,
        urlValue: true,
      },
    });

    const updateData: {
      textValue?: string | null;
      statusValue?: string | null;
      personId?: string | null;
      dateValue?: Date | null;
      numberValue?: number | null;
      tagsValue?: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput;
      checkboxValue?: boolean | null;
      urlValue?: string | null;
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

    if (column.type === BoardColumnType.NUMBER && payload.numberValue !== undefined) {
      updateData.numberValue = payload.numberValue;
    }

    if (column.type === BoardColumnType.TAGS && payload.tagsValue !== undefined) {
      updateData.tagsValue = payload.tagsValue === null ? Prisma.DbNull : payload.tagsValue;
    }

    if (column.type === BoardColumnType.CHECKBOX && payload.checkboxValue !== undefined) {
      updateData.checkboxValue = payload.checkboxValue;
    }

    if (column.type === BoardColumnType.URL && payload.urlValue !== undefined) {
      updateData.urlValue = payload.urlValue;
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
    const updatedItem = await prisma.boardItem.update({
      where: {
        id: item.id,
      },
      data: {
        lastEditedById: userId,
      },
      select: {
        lastEditedById: true,
      },
    });

    const previousValue =
      column.type === BoardColumnType.TEXT
        ? existingValue?.textValue ?? null
        : column.type === BoardColumnType.STATUS
          ? existingValue?.statusValue ?? null
          : column.type === BoardColumnType.PERSON
            ? existingValue?.personId ?? null
            : column.type === BoardColumnType.DATE
              ? existingValue?.dateValue
                ? existingValue.dateValue.toISOString()
                : null
              : column.type === BoardColumnType.NUMBER
                ? existingValue?.numberValue ?? null
                : column.type === BoardColumnType.TAGS
                  ? normalizeTagsValue(existingValue?.tagsValue ?? null)
                  : column.type === BoardColumnType.CHECKBOX
                    ? existingValue?.checkboxValue ?? null
                    : existingValue?.urlValue ?? null;
    const nextValue =
      column.type === BoardColumnType.TEXT
        ? value.textValue
        : column.type === BoardColumnType.STATUS
          ? value.statusValue
          : column.type === BoardColumnType.PERSON
            ? value.personId
            : column.type === BoardColumnType.DATE
              ? value.dateValue
                ? value.dateValue.toISOString()
                : null
              : column.type === BoardColumnType.NUMBER
                ? value.numberValue ?? null
                : column.type === BoardColumnType.TAGS
                  ? normalizeTagsValue(value.tagsValue)
                  : column.type === BoardColumnType.CHECKBOX
                    ? value.checkboxValue ?? null
                    : value.urlValue ?? null;

    if (JSON.stringify(previousValue) !== JSON.stringify(nextValue)) {
      await writeWorkspaceAuditLog({
        workspaceId: column.board.workspaceId,
        actorUserId: userId,
        action: "board_item_cell_updated",
        entityType: "BoardCellValue",
        entityId: value.id,
        details: {
          boardId,
          itemId,
          columnId,
          columnName: column.name,
          columnType: column.type,
          previousValue,
          nextValue,
        },
      });

      if (column.type === BoardColumnType.TEXT && typeof value.textValue === "string") {
        await createMentionNotifications({
          workspaceId: column.board.workspaceId,
          actorUserId: userId,
          text: value.textValue,
          contextLabel: `Mentioned in ${column.name}`,
          entityType: "BoardCellValue",
          entityId: value.id,
        });
      }

      if (column.type === BoardColumnType.PERSON) {
        await createAssignmentChangeNotifications({
          workspaceId: column.board.workspaceId,
          actorUserId: userId,
          itemName: item.name,
          previousAssigneeId: existingValue?.personId ?? null,
          nextAssigneeId: value.personId,
          entityType: "BoardItem",
          entityId: item.id,
        });
      }
    }

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
      numberValue: value.numberValue,
      tagsValue: normalizeTagsValue(value.tagsValue),
      checkboxValue: value.checkboxValue,
      urlValue: value.urlValue,
      itemLastEditedById: updatedItem.lastEditedById,
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
