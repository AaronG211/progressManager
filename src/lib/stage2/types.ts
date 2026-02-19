import type { WorkspaceRole } from "@prisma/client";

export type WorkspaceMemberSummary = {
  userId: string;
  email: string;
  name: string | null;
  role: WorkspaceRole;
  joinedAt: string;
};

export type WorkspaceInviteSummary = {
  id: string;
  email: string;
  role: WorkspaceRole;
  status: "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED";
  invitedByUserId: string;
  invitedByLabel: string;
  expiresAt: string;
  createdAt: string;
};

export type BoardShareSettingsSummary = {
  role: WorkspaceRole;
  canWrite: boolean;
  canManage: boolean;
  isPrivate: boolean;
  shareUrl: string | null;
};

export type WorkspaceNotificationSummary = {
  id: string;
  workspaceId: string;
  type: "MENTION" | "ASSIGNMENT_CHANGED";
  title: string;
  message: string;
  entityType: string;
  entityId: string | null;
  actorLabel: string | null;
  readAt: string | null;
  createdAt: string;
};
