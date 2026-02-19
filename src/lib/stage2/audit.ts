import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";

type WorkspaceAuditInput = {
  workspaceId: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  actorUserId?: string | null;
  details?: Record<string, unknown> | null;
};

export async function writeWorkspaceAuditLog({
  workspaceId,
  action,
  entityType,
  entityId = null,
  actorUserId = null,
  details = null,
}: WorkspaceAuditInput): Promise<void> {
  const safeDetails =
    details === null ? undefined : (details as unknown as Prisma.InputJsonValue);

  await prisma.workspaceAuditLog.create({
    data: {
      workspaceId,
      action,
      entityType,
      entityId,
      actorUserId,
      details: safeDetails,
    },
  });
}
