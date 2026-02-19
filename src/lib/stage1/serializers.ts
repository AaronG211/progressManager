import { Prisma } from "@prisma/client";
import type {
  StageBoardViewConfig,
  StageOneBoardSnapshot,
  StageOneColumnSettings,
} from "@/lib/stage1/types";

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
  views: {
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

function asViewConfig(value: Prisma.JsonValue | null): StageBoardViewConfig | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as StageBoardViewConfig;
}

function asTagsValue(value: Prisma.JsonValue | null): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const normalized = value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  return normalized;
}

export function serializeBoardSnapshot(board: StageOneBoardRecord): StageOneBoardSnapshot {
  return {
    workspaceId: board.workspaceId,
    boardId: board.id,
    boardName: board.name,
    views: board.views.map((view) => ({
      id: view.id,
      name: view.name,
      type: view.type,
      position: view.position,
      config: asViewConfig(view.config),
    })),
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
          numberValue: value.numberValue,
          tagsValue: asTagsValue(value.tagsValue),
          checkboxValue: value.checkboxValue,
          urlValue: value.urlValue,
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
