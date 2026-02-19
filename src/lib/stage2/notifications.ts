import { prisma } from "@/lib/db/prisma";
import { resolveMentionedMemberIds } from "@/lib/stage2/mentions";
import { WorkspaceNotificationType } from "@prisma/client";

type BaseNotificationInput = {
  workspaceId: string;
  actorUserId: string;
  entityType: string;
  entityId: string;
};

type MentionNotificationInput = BaseNotificationInput & {
  text: string;
  contextLabel: string;
};

type AssignmentNotificationInput = BaseNotificationInput & {
  itemName: string;
  previousAssigneeId: string | null;
  nextAssigneeId: string | null;
};

function normalizeTextSnippet(text: string): string {
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.length > 160 ? `${compact.slice(0, 157)}...` : compact;
}

async function getWorkspaceMentionMembers(workspaceId: string): Promise<
  Array<{
    userId: string;
    email: string;
    name: string | null;
  }>
> {
  const members = await prisma.workspaceMember.findMany({
    where: {
      workspaceId,
    },
    select: {
      userId: true,
      user: {
        select: {
          email: true,
          name: true,
        },
      },
    },
  });

  return members.map((member) => ({
    userId: member.userId,
    email: member.user.email,
    name: member.user.name,
  }));
}

export async function createMentionNotifications({
  workspaceId,
  actorUserId,
  text,
  contextLabel,
  entityType,
  entityId,
}: MentionNotificationInput): Promise<number> {
  if (!text.trim()) {
    return 0;
  }

  const members = await getWorkspaceMentionMembers(workspaceId);
  const recipients = resolveMentionedMemberIds(text, members).filter(
    (recipientId) => recipientId !== actorUserId,
  );

  if (recipients.length === 0) {
    return 0;
  }

  const snippet = normalizeTextSnippet(text);

  const result = await prisma.workspaceNotification.createMany({
    data: recipients.map((userId) => ({
      workspaceId,
      userId,
      actorUserId,
      type: WorkspaceNotificationType.MENTION,
      title: "You were mentioned",
      message: `${contextLabel}: ${snippet}`,
      entityType,
      entityId,
    })),
  });

  return result.count;
}

export async function createAssignmentChangeNotifications({
  workspaceId,
  actorUserId,
  itemName,
  previousAssigneeId,
  nextAssigneeId,
  entityType,
  entityId,
}: AssignmentNotificationInput): Promise<number> {
  if (previousAssigneeId === nextAssigneeId) {
    return 0;
  }

  const notifications: Array<{
    workspaceId: string;
    userId: string;
    actorUserId: string;
    type: WorkspaceNotificationType;
    title: string;
    message: string;
    entityType: string;
    entityId: string;
  }> = [];

  if (nextAssigneeId && nextAssigneeId !== actorUserId) {
    notifications.push({
      workspaceId,
      userId: nextAssigneeId,
      actorUserId,
      type: WorkspaceNotificationType.ASSIGNMENT_CHANGED,
      title: "You were assigned",
      message: `Assigned to item: ${itemName}`,
      entityType,
      entityId,
    });
  }

  if (previousAssigneeId && previousAssigneeId !== actorUserId) {
    notifications.push({
      workspaceId,
      userId: previousAssigneeId,
      actorUserId,
      type: WorkspaceNotificationType.ASSIGNMENT_CHANGED,
      title: "You were unassigned",
      message: `Unassigned from item: ${itemName}`,
      entityType,
      entityId,
    });
  }

  if (notifications.length === 0) {
    return 0;
  }

  const result = await prisma.workspaceNotification.createMany({
    data: notifications,
  });

  return result.count;
}
