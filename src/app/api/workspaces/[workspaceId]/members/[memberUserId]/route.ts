import { prisma } from "@/lib/db/prisma";
import { getTelemetryClient } from "@/lib/observability";
import { writeWorkspaceAuditLog } from "@/lib/stage2/audit";
import {
  canManageWorkspace,
  canUpdateMemberRole,
  getWorkspaceAccess,
} from "@/lib/stage2/workspace-access";
import { WorkspaceRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

const telemetry = getTelemetryClient();

const updateMemberRoleSchema = z.object({
  role: z.nativeEnum(WorkspaceRole),
});

type RouteContext = {
  params: Promise<{ workspaceId: string; memberUserId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const { workspaceId, memberUserId } = await context.params;
  const access = await getWorkspaceAccess(workspaceId);

  if (access.status === "unauthenticated") {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  if (access.status === "not_found") {
    return NextResponse.json({ message: "Workspace not found" }, { status: 404 });
  }

  if (!canManageWorkspace(access.role)) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  if (memberUserId === access.userId) {
    return NextResponse.json(
      { message: "Self role updates are not supported in this endpoint" },
      { status: 400 },
    );
  }

  let payload: z.infer<typeof updateMemberRoleSchema>;

  try {
    payload = updateMemberRoleSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ message: "Invalid payload" }, { status: 400 });
  }

  try {
    const targetMember = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId: memberUserId,
        },
      },
      include: {
        user: {
          select: {
            email: true,
            name: true,
          },
        },
      },
    });

    if (!targetMember) {
      return NextResponse.json({ message: "Member not found" }, { status: 404 });
    }

    if (!canUpdateMemberRole(access.role, targetMember.role, payload.role)) {
      return NextResponse.json({ message: "Cannot assign requested role" }, { status: 403 });
    }

    const updatedMember = await prisma.workspaceMember.update({
      where: {
        id: targetMember.id,
      },
      data: {
        role: payload.role,
      },
      include: {
        user: {
          select: {
            email: true,
            name: true,
          },
        },
      },
    });

    await writeWorkspaceAuditLog({
      workspaceId,
      actorUserId: access.userId,
      action: "workspace_member_role_updated",
      entityType: "WorkspaceMember",
      entityId: updatedMember.id,
      details: {
        targetUserId: memberUserId,
        previousRole: targetMember.role,
        nextRole: payload.role,
      },
    });

    return NextResponse.json({
      userId: updatedMember.userId,
      email: updatedMember.user.email,
      name: updatedMember.user.name,
      role: updatedMember.role,
    });
  } catch (error: unknown) {
    telemetry.captureException(error, {
      route: "/api/workspaces/[workspaceId]/members/[memberUserId]",
      workspaceId,
      memberUserId,
      userId: access.userId,
    });

    return NextResponse.json({ message: "Unable to update member role" }, { status: 500 });
  }
}
