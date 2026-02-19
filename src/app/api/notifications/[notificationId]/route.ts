import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedAppUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { getTelemetryClient } from "@/lib/observability";

const telemetry = getTelemetryClient();

const updateSchema = z.object({
  read: z.boolean().default(true),
});

type RouteContext = {
  params: Promise<{ notificationId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const sessionUser = await getAuthenticatedAppUser();

  if (!sessionUser) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { notificationId } = await context.params;

  let payload: z.infer<typeof updateSchema>;

  try {
    payload = updateSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ message: "Invalid payload" }, { status: 400 });
  }

  try {
    const notification = await prisma.workspaceNotification.findFirst({
      where: {
        id: notificationId,
        userId: sessionUser.appUserId,
      },
      select: {
        id: true,
      },
    });

    if (!notification) {
      return NextResponse.json({ message: "Notification not found" }, { status: 404 });
    }

    const updated = await prisma.workspaceNotification.update({
      where: {
        id: notification.id,
      },
      data: {
        readAt: payload.read ? new Date() : null,
      },
      select: {
        id: true,
        readAt: true,
      },
    });

    return NextResponse.json({
      id: updated.id,
      readAt: updated.readAt ? updated.readAt.toISOString() : null,
    });
  } catch (error: unknown) {
    telemetry.captureException(error, {
      route: "/api/notifications/[notificationId]",
      notificationId,
      userId: sessionUser.appUserId,
      method: "PATCH",
    });

    return NextResponse.json({ message: "Unable to update notification" }, { status: 500 });
  }
}
