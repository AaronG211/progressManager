import { WorkspaceRole } from "@prisma/client";
import { getAuthenticatedAppUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

export type WorkspaceAccessResult =
  | { status: "unauthenticated" }
  | { status: "not_found" }
  | { status: "ok"; userId: string; role: WorkspaceRole };

export function canManageWorkspace(role: WorkspaceRole): boolean {
  return role === WorkspaceRole.OWNER || role === WorkspaceRole.ADMIN;
}

export function canAssignInviteRole(
  actorRole: WorkspaceRole,
  inviteRole: WorkspaceRole,
): boolean {
  if (inviteRole === WorkspaceRole.OWNER) {
    return false;
  }

  if (actorRole === WorkspaceRole.OWNER) {
    return true;
  }

  if (actorRole === WorkspaceRole.ADMIN) {
    return inviteRole === WorkspaceRole.MEMBER || inviteRole === WorkspaceRole.VIEWER;
  }

  return false;
}

export function canUpdateMemberRole(
  actorRole: WorkspaceRole,
  targetRole: WorkspaceRole,
  nextRole: WorkspaceRole,
): boolean {
  if (nextRole === WorkspaceRole.OWNER) {
    return false;
  }

  if (actorRole === WorkspaceRole.OWNER) {
    if (targetRole === WorkspaceRole.OWNER) {
      return false;
    }

    return true;
  }

  if (actorRole === WorkspaceRole.ADMIN) {
    if (targetRole === WorkspaceRole.OWNER || targetRole === WorkspaceRole.ADMIN) {
      return false;
    }

    return nextRole === WorkspaceRole.MEMBER || nextRole === WorkspaceRole.VIEWER;
  }

  return false;
}

export function getRolePriority(role: WorkspaceRole): number {
  if (role === WorkspaceRole.OWNER) {
    return 4;
  }

  if (role === WorkspaceRole.ADMIN) {
    return 3;
  }

  if (role === WorkspaceRole.MEMBER) {
    return 2;
  }

  return 1;
}

export function resolveRoleOnInviteAccept(
  existingRole: WorkspaceRole | null,
  invitedRole: WorkspaceRole,
): WorkspaceRole {
  if (!existingRole) {
    return invitedRole;
  }

  return getRolePriority(existingRole) >= getRolePriority(invitedRole)
    ? existingRole
    : invitedRole;
}

export async function getWorkspaceAccess(
  workspaceId: string,
): Promise<WorkspaceAccessResult> {
  const sessionUser = await getAuthenticatedAppUser();

  if (!sessionUser) {
    return { status: "unauthenticated" };
  }

  const membership = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId,
        userId: sessionUser.appUserId,
      },
    },
    select: {
      role: true,
    },
  });

  if (!membership) {
    return { status: "not_found" };
  }

  return {
    status: "ok",
    userId: sessionUser.appUserId,
    role: membership.role,
  };
}
