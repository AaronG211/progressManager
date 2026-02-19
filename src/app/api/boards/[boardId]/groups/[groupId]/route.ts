import { prisma } from "@/lib/db/prisma";
import { getTelemetryClient } from "@/lib/observability";
import { canWriteBoard, getBoardAccess } from "@/lib/stage1/route-utils";
import { z } from "zod";
import { NextResponse } from "next/server";

const telemetry = getTelemetryClient();

const updateGroupSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    isCollapsed: z.boolean().optional(),
  })
  .refine((value) => value.name !== undefined || value.isCollapsed !== undefined, {
    message: "Nothing to update",
  });

type RouteContext = {
  params: Promise<{ boardId: string; groupId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const { boardId, groupId } = await context.params;
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

  let payload: z.infer<typeof updateGroupSchema>;

  try {
    payload = updateGroupSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ message: "Invalid payload" }, { status: 400 });
  }

  try {
    const group = await prisma.boardGroup.findFirst({
      where: {
        id: groupId,
        boardId,
      },
    });

    if (!group) {
      return NextResponse.json({ message: "Group not found" }, { status: 404 });
    }

    const updatedGroup = await prisma.boardGroup.update({
      where: {
        id: group.id,
      },
      data: {
        name: payload.name,
        isCollapsed: payload.isCollapsed,
      },
    });

    telemetry.track("stage1_group_updated", {
      boardId,
      groupId,
      userId,
    });

    return NextResponse.json(updatedGroup);
  } catch (error: unknown) {
    telemetry.captureException(error, {
      route: "/api/boards/[boardId]/groups/[groupId]",
      boardId,
      groupId,
      userId,
    });

    return NextResponse.json({ message: "Unable to update group" }, { status: 500 });
  }
}
