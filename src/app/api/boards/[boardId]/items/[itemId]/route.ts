import { prisma } from "@/lib/db/prisma";
import { getTelemetryClient } from "@/lib/observability";
import { canWriteBoard, getBoardAccess } from "@/lib/stage1/route-utils";
import { writeWorkspaceAuditLog } from "@/lib/stage2/audit";
import { createMentionNotifications } from "@/lib/stage2/notifications";
import { z } from "zod";
import { NextResponse } from "next/server";

const telemetry = getTelemetryClient();

const updateItemSchema = z
  .object({
    name: z.string().trim().min(1).max(160).optional(),
    groupId: z.string().cuid().optional(),
  })
  .refine((value) => value.name !== undefined || value.groupId !== undefined, {
    message: "Nothing to update",
  });

type RouteContext = {
  params: Promise<{ boardId: string; itemId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const { boardId, itemId } = await context.params;
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

  let payload: z.infer<typeof updateItemSchema>;

  try {
    payload = updateItemSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ message: "Invalid payload" }, { status: 400 });
  }

  try {
    const existingItem = await prisma.boardItem.findFirst({
      where: {
        id: itemId,
        boardId,
      },
      select: {
        id: true,
        name: true,
        groupId: true,
        board: {
          select: {
            workspaceId: true,
          },
        },
      },
    });

    if (!existingItem) {
      return NextResponse.json({ message: "Item not found" }, { status: 404 });
    }

    const updateData: {
      name?: string;
      groupId?: string;
      position?: number;
      lastEditedById: string;
    } = {
      lastEditedById: userId,
    };

    if (payload.name !== undefined) {
      updateData.name = payload.name;
    }

    if (payload.groupId && payload.groupId !== existingItem.groupId) {
      const targetGroup = await prisma.boardGroup.findFirst({
        where: {
          id: payload.groupId,
          boardId,
        },
        select: {
          id: true,
        },
      });

      if (!targetGroup) {
        return NextResponse.json({ message: "Target group not found" }, { status: 404 });
      }

      const latestPosition = await prisma.boardItem.aggregate({
        where: {
          groupId: payload.groupId,
        },
        _max: {
          position: true,
        },
      });

      updateData.groupId = payload.groupId;
      updateData.position = (latestPosition._max.position ?? -1) + 1;
    }

    const updatedItem = await prisma.boardItem.update({
      where: {
        id: existingItem.id,
      },
      data: updateData,
    });

    await writeWorkspaceAuditLog({
      workspaceId: existingItem.board.workspaceId,
      actorUserId: userId,
      action: "board_item_updated",
      entityType: "BoardItem",
      entityId: updatedItem.id,
      details: {
        boardId,
        previousName: existingItem.name,
        nextName: updatedItem.name,
        previousGroupId: existingItem.groupId,
        nextGroupId: updatedItem.groupId,
      },
    });

    if (payload.name !== undefined && payload.name !== existingItem.name) {
      await createMentionNotifications({
        workspaceId: existingItem.board.workspaceId,
        actorUserId: userId,
        text: payload.name,
        contextLabel: `Mentioned in item name`,
        entityType: "BoardItem",
        entityId: updatedItem.id,
      });
    }

    telemetry.track("stage1_item_updated", {
      boardId,
      itemId,
      userId,
    });

    return NextResponse.json(updatedItem);
  } catch (error: unknown) {
    telemetry.captureException(error, {
      route: "/api/boards/[boardId]/items/[itemId]",
      boardId,
      itemId,
      userId,
    });

    return NextResponse.json({ message: "Unable to update item" }, { status: 500 });
  }
}
