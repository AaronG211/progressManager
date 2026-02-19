import { prisma } from "@/lib/db/prisma";
import { getTelemetryClient } from "@/lib/observability";
import { getWorkspaceAccess, canManageWorkspace } from "@/lib/stage2/workspace-access";
import type { WorkspaceInviteSummary, WorkspaceMemberSummary } from "@/lib/stage2/types";
import { WorkspaceInviteStatus } from "@prisma/client";
import { NextResponse } from "next/server";

const telemetry = getTelemetryClient();

type RouteContext = {
  params: Promise<{ workspaceId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { workspaceId } = await context.params;
  const access = await getWorkspaceAccess(workspaceId);

  if (access.status === "unauthenticated") {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  if (access.status === "not_found") {
    return NextResponse.json({ message: "Workspace not found" }, { status: 404 });
  }

  try {
    const [members, invites] = await Promise.all([
      prisma.workspaceMember.findMany({
        where: {
          workspaceId,
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
        },
        orderBy: {
          createdAt: "asc",
        },
      }),
      canManageWorkspace(access.role)
        ? prisma.workspaceInvite.findMany({
            where: {
              workspaceId,
              status: WorkspaceInviteStatus.PENDING,
              expiresAt: {
                gte: new Date(),
              },
            },
            include: {
              invitedBy: {
                select: {
                  id: true,
                  email: true,
                  name: true,
                },
              },
            },
            orderBy: {
              createdAt: "desc",
            },
          })
        : Promise.resolve([]),
    ]);

    const memberSummaries: WorkspaceMemberSummary[] = members.map((member) => ({
      userId: member.userId,
      email: member.user.email,
      name: member.user.name,
      role: member.role,
      joinedAt: member.createdAt.toISOString(),
    }));

    const inviteSummaries: WorkspaceInviteSummary[] = invites.map((invite) => ({
      id: invite.id,
      email: invite.email,
      role: invite.role,
      status: invite.status,
      invitedByUserId: invite.invitedById,
      invitedByLabel: invite.invitedBy.name || invite.invitedBy.email,
      expiresAt: invite.expiresAt.toISOString(),
      createdAt: invite.createdAt.toISOString(),
    }));

    return NextResponse.json({
      workspaceId,
      currentUserRole: access.role,
      members: memberSummaries,
      pendingInvites: inviteSummaries,
    });
  } catch (error: unknown) {
    telemetry.captureException(error, {
      route: "/api/workspaces/[workspaceId]/members",
      workspaceId,
      userId: access.userId,
    });

    return NextResponse.json({ message: "Unable to load workspace members" }, { status: 500 });
  }
}
