import { prisma } from "@/lib/db/prisma";
import { getTelemetryClient } from "@/lib/observability";
import { writeWorkspaceAuditLog } from "@/lib/stage2/audit";
import { createInviteToken, getInviteExpiryDate, normalizeInviteEmail } from "@/lib/stage2/invites";
import { canAssignInviteRole, canManageWorkspace, getWorkspaceAccess } from "@/lib/stage2/workspace-access";
import type { WorkspaceInviteSummary } from "@/lib/stage2/types";
import { WorkspaceInviteStatus, WorkspaceRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

const telemetry = getTelemetryClient();

const createInviteSchema = z.object({
  email: z.string().trim().email(),
  role: z.nativeEnum(WorkspaceRole).default(WorkspaceRole.MEMBER),
});

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

  if (!canManageWorkspace(access.role)) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  try {
    const invites = await prisma.workspaceInvite.findMany({
      where: {
        workspaceId,
        status: WorkspaceInviteStatus.PENDING,
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
    });

    const response: WorkspaceInviteSummary[] = invites.map((invite) => ({
      id: invite.id,
      email: invite.email,
      role: invite.role,
      status: invite.status,
      invitedByUserId: invite.invitedById,
      invitedByLabel: invite.invitedBy.name || invite.invitedBy.email,
      expiresAt: invite.expiresAt.toISOString(),
      createdAt: invite.createdAt.toISOString(),
    }));

    return NextResponse.json({ invites: response });
  } catch (error: unknown) {
    telemetry.captureException(error, {
      route: "/api/workspaces/[workspaceId]/invites",
      workspaceId,
      userId: access.userId,
      method: "GET",
    });

    return NextResponse.json({ message: "Unable to load invites" }, { status: 500 });
  }
}

export async function POST(request: Request, context: RouteContext) {
  const { workspaceId } = await context.params;
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

  let payload: z.infer<typeof createInviteSchema>;

  try {
    payload = createInviteSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ message: "Invalid payload" }, { status: 400 });
  }

  if (!canAssignInviteRole(access.role, payload.role)) {
    return NextResponse.json({ message: "Cannot assign requested role" }, { status: 403 });
  }

  const inviteEmail = normalizeInviteEmail(payload.email);

  try {
    const existingMember = await prisma.workspaceMember.findFirst({
      where: {
        workspaceId,
        user: {
          email: inviteEmail,
        },
      },
      select: {
        userId: true,
      },
    });

    if (existingMember) {
      return NextResponse.json({ message: "User is already a workspace member" }, { status: 409 });
    }

    await prisma.workspaceInvite.updateMany({
      where: {
        workspaceId,
        email: inviteEmail,
        status: WorkspaceInviteStatus.PENDING,
      },
      data: {
        status: WorkspaceInviteStatus.REVOKED,
      },
    });

    const invite = await prisma.workspaceInvite.create({
      data: {
        workspaceId,
        invitedById: access.userId,
        email: inviteEmail,
        role: payload.role,
        token: createInviteToken(),
        expiresAt: getInviteExpiryDate(),
      },
    });

    await writeWorkspaceAuditLog({
      workspaceId,
      actorUserId: access.userId,
      action: "workspace_invite_created",
      entityType: "WorkspaceInvite",
      entityId: invite.id,
      details: {
        email: inviteEmail,
        role: invite.role,
      },
    });

    const requestUrl = new URL(request.url);
    const inviteUrl = `${requestUrl.origin}/api/workspaces/invites/${invite.token}/accept`;

    return NextResponse.json(
      {
        id: invite.id,
        email: invite.email,
        role: invite.role,
        status: invite.status,
        expiresAt: invite.expiresAt.toISOString(),
        inviteUrl,
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    telemetry.captureException(error, {
      route: "/api/workspaces/[workspaceId]/invites",
      workspaceId,
      userId: access.userId,
      method: "POST",
      email: inviteEmail,
    });

    return NextResponse.json({ message: "Unable to create invite" }, { status: 500 });
  }
}
