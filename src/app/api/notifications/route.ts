import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedAppUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { getTelemetryClient } from "@/lib/observability";
import type { WorkspaceNotificationSummary } from "@/lib/stage2/types";

const telemetry = getTelemetryClient();

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export async function GET(request: Request) {
  const sessionUser = await getAuthenticatedAppUser();

  if (!sessionUser) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  let query: z.infer<typeof querySchema>;

  try {
    const requestUrl = new URL(request.url);
    query = querySchema.parse({
      limit: requestUrl.searchParams.get("limit") ?? 20,
    });
  } catch {
    return NextResponse.json({ message: "Invalid query" }, { status: 400 });
  }

  try {
    const notifications = await prisma.workspaceNotification.findMany({
      where: {
        userId: sessionUser.appUserId,
      },
      include: {
        actor: {
          select: {
            email: true,
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: query.limit,
    });

    const summaries: WorkspaceNotificationSummary[] = notifications.map((notification) => ({
      id: notification.id,
      workspaceId: notification.workspaceId,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      entityType: notification.entityType,
      entityId: notification.entityId,
      actorLabel: notification.actor
        ? notification.actor.name || notification.actor.email
        : null,
      readAt: notification.readAt ? notification.readAt.toISOString() : null,
      createdAt: notification.createdAt.toISOString(),
    }));

    return NextResponse.json({ notifications: summaries });
  } catch (error: unknown) {
    telemetry.captureException(error, {
      route: "/api/notifications",
      userId: sessionUser.appUserId,
      method: "GET",
    });

    return NextResponse.json({ message: "Unable to load notifications" }, { status: 500 });
  }
}
