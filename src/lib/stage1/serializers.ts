import { Prisma } from "@prisma/client";
import type { StageOneBoardSnapshot, StageOneColumnSettings } from "@/lib/stage1/types";

export const stageOneBoardInclude = Prisma.validator<Prisma.BoardInclude>()({
  workspace: {
    include: {
      members: {
        include: {
          user: true,
        },
        orderBy: {
          createdAt: "asc",
        },
      },
    },
  },
  columns: {
    orderBy: {
      position: "asc",
    },
  },
  groups: {
    orderBy: {
      position: "asc",
    },
    include: {
      items: {
        orderBy: {
          position: "asc",
        },
        include: {
          values: {
            orderBy: {
              createdAt: "asc",
            },
          },
        },
      },
    },
  },
});

export type StageOneBoardRecord = Prisma.BoardGetPayload<{
  include: typeof stageOneBoardInclude;
}>;

function asColumnSettings(value: Prisma.JsonValue | null): StageOneColumnSettings | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as StageOneColumnSettings;
}

export function serializeBoardSnapshot(board: StageOneBoardRecord): StageOneBoardSnapshot {
  return {
    workspaceId: board.workspaceId,
    boardId: board.id,
    boardName: board.name,
    columns: board.columns.map((column) => ({
      id: column.id,
      name: column.name,
      type: column.type,
      position: column.position,
      settings: asColumnSettings(column.settings),
    })),
    groups: board.groups.map((group) => ({
      id: group.id,
      name: group.name,
      position: group.position,
      isCollapsed: group.isCollapsed,
      items: group.items.map((item) => ({
        id: item.id,
        groupId: item.groupId,
        name: item.name,
        position: item.position,
        lastEditedById: item.lastEditedById,
        values: item.values.map((value) => ({
          id: value.id,
          itemId: value.itemId,
          columnId: value.columnId,
          textValue: value.textValue,
          statusValue: value.statusValue,
          personId: value.personId,
          dateValue: value.dateValue ? value.dateValue.toISOString() : null,
        })),
      })),
    })),
    members: board.workspace.members.map((member) => ({
      userId: member.userId,
      email: member.user.email,
      name: member.user.name,
      role: member.role,
    })),
  };
}
