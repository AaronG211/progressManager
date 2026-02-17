import { prisma } from "@/lib/db/prisma";
import { getTelemetryClient } from "@/lib/observability";
import { getBoardAccess } from "@/lib/stage1/route-utils";
import { z } from "zod";
import { NextResponse } from "next/server";

const telemetry = getTelemetryClient();

const createItemSchema = z.object({
  groupId: z.string().cuid(),
  name: z.string().trim().min(1).max(160),
});

type RouteContext = {
  params: Promise<{ boardId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { boardId } = await context.params;
  const access = await getBoardAccess(boardId);

  if (access.status === "unauthenticated") {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  if (access.status === "not_found") {
    return NextResponse.json({ message: "Board not found" }, { status: 404 });
  }

  const userId = access.userId;

  let payload: z.infer<typeof createItemSchema>;

  try {
    payload = createItemSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ message: "Invalid payload" }, { status: 400 });
  }

  try {
    const group = await prisma.boardGroup.findFirst({
      where: {
        id: payload.groupId,
        boardId,
      },
      select: {
        id: true,
      },
    });

    if (!group) {
      return NextResponse.json({ message: "Group not found" }, { status: 404 });
    }

    const latestPosition = await prisma.boardItem.aggregate({
      where: {
        groupId: payload.groupId,
      },
      _max: {
        position: true,
      },
    });

    const item = await prisma.boardItem.create({
      data: {
        boardId,
        groupId: payload.groupId,
        name: payload.name,
        position: (latestPosition._max.position ?? -1) + 1,
        lastEditedById: userId,
      },
    });

    telemetry.track("stage1_item_created", {
      boardId,
      groupId: payload.groupId,
      itemId: item.id,
      userId,
    });

    return NextResponse.json(
      {
        ...item,
        values: [],
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    telemetry.captureException(error, {
      route: "/api/boards/[boardId]/items",
      boardId,
      userId,
    });

    return NextResponse.json({ message: "Unable to create item" }, { status: 500 });
  }
}
