import { prisma } from "@/lib/db/prisma";
import { WorkspaceInviteStatus, WorkspaceRole } from "@prisma/client";
import { writeWorkspaceAuditLog } from "@/lib/stage2/audit";
import { resolveRoleOnInviteAccept } from "@/lib/stage2/workspace-access";
import { randomBytes } from "node:crypto";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function createInviteToken(): string {
  return randomBytes(24).toString("hex");
}

export function getInviteExpiryDate(): Date {
  return new Date(Date.now() + INVITE_TTL_MS);
}

export type AcceptWorkspaceInviteResult =
  | { status: "accepted"; workspaceId: string }
  | { status: "not_found" }
  | { status: "expired" }
  | { status: "invalid_status" }
  | { status: "email_mismatch" };

export async function acceptWorkspaceInvite(
  token: string,
  user: { userId: string; email: string },
): Promise<AcceptWorkspaceInviteResult> {
  const invite = await prisma.workspaceInvite.findUnique({
    where: {
      token,
    },
  });

  if (!invite) {
    return { status: "not_found" };
  }

  if (invite.status === WorkspaceInviteStatus.ACCEPTED) {
    return { status: "accepted", workspaceId: invite.workspaceId };
  }

  if (invite.status !== WorkspaceInviteStatus.PENDING) {
    return { status: "invalid_status" };
  }

  if (invite.expiresAt.getTime() < Date.now()) {
    await prisma.workspaceInvite.update({
      where: {
        id: invite.id,
      },
      data: {
        status: WorkspaceInviteStatus.EXPIRED,
      },
    });
    return { status: "expired" };
  }

  if (invite.email.toLowerCase() !== user.email.toLowerCase()) {
    return { status: "email_mismatch" };
  }

  await prisma.$transaction(async (tx) => {
    const existingMembership = await tx.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: invite.workspaceId,
          userId: user.userId,
        },
      },
      select: {
        role: true,
      },
    });

    const resolvedRole = resolveRoleOnInviteAccept(existingMembership?.role ?? null, invite.role);

    if (!existingMembership) {
      await tx.workspaceMember.create({
        data: {
          workspaceId: invite.workspaceId,
          userId: user.userId,
          role: resolvedRole,
        },
      });
    } else if (existingMembership.role !== resolvedRole) {
      await tx.workspaceMember.update({
        where: {
          workspaceId_userId: {
            workspaceId: invite.workspaceId,
            userId: user.userId,
          },
        },
        data: {
          role: resolvedRole,
        },
      });
    }

    await tx.workspaceInvite.update({
      where: {
        id: invite.id,
      },
      data: {
        status: WorkspaceInviteStatus.ACCEPTED,
        acceptedById: user.userId,
        acceptedAt: new Date(),
      },
    });
  });

  await writeWorkspaceAuditLog({
    workspaceId: invite.workspaceId,
    actorUserId: user.userId,
    action: "workspace_invite_accepted",
    entityType: "WorkspaceInvite",
    entityId: invite.id,
    details: {
      role: invite.role,
      email: invite.email,
    },
  });

  return { status: "accepted", workspaceId: invite.workspaceId };
}

export function normalizeInviteEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function normalizeInviteRole(role: WorkspaceRole): WorkspaceRole {
  return role;
}
