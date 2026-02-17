import { prisma } from "@/lib/db/prisma";
import { getTelemetryClient } from "@/lib/observability";
import { getBoardAccess } from "@/lib/stage1/route-utils";
import { z } from "zod";
import { NextResponse } from "next/server";

const telemetry = getTelemetryClient();

const createGroupSchema = z.object({
  name: z.string().trim().min(1).max(80),
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

  let payload: z.infer<typeof createGroupSchema>;

  try {
    payload = createGroupSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ message: "Invalid payload" }, { status: 400 });
  }

  try {
    const latestGroupPosition = await prisma.boardGroup.aggregate({
      where: {
        boardId,
      },
      _max: {
        position: true,
      },
    });

    const group = await prisma.boardGroup.create({
      data: {
        boardId,
        name: payload.name,
        position: (latestGroupPosition._max.position ?? -1) + 1,
      },
    });

    telemetry.track("stage1_group_created", {
      boardId,
      groupId: group.id,
      userId,
    });

    return NextResponse.json(group, { status: 201 });
  } catch (error: unknown) {
    telemetry.captureException(error, {
      route: "/api/boards/[boardId]/groups",
      boardId,
      userId,
    });

    return NextResponse.json({ message: "Unable to create group" }, { status: 500 });
  }
}
