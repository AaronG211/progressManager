import { BoardColumnType, WorkspaceRole } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getBoardSnapshot } from "@/lib/stage1/board-query";

const defaultStatusOptions = [
  { label: "Not Started", color: "slate" },
  { label: "Working", color: "amber" },
  { label: "Blocked", color: "rose" },
  { label: "Done", color: "emerald" },
];

async function getOrCreateWorkspace(userId: string) {
  const existingWorkspace = await prisma.workspace.findFirst({
    where: {
      ownerId: userId,
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  if (existingWorkspace) {
    return existingWorkspace;
  }

  return prisma.workspace.create({
    data: {
      name: "Product Operations",
      ownerId: userId,
    },
  });
}

async function createDefaultBoard(workspaceId: string, userId: string): Promise<string> {
  const board = await prisma.board.create({
    data: {
      workspaceId,
      name: "Team Task Board",
      createdById: userId,
    },
  });

  await prisma.boardColumn.createMany({
    data: [
      {
        boardId: board.id,
        name: "Notes",
        type: BoardColumnType.TEXT,
        position: 0,
      },
      {
        boardId: board.id,
        name: "Status",
        type: BoardColumnType.STATUS,
        position: 1,
        settings: { options: defaultStatusOptions },
      },
      {
        boardId: board.id,
        name: "Owner",
        type: BoardColumnType.PERSON,
        position: 2,
      },
      {
        boardId: board.id,
        name: "Due Date",
        type: BoardColumnType.DATE,
        position: 3,
      },
    ],
  });

  await prisma.boardGroup.createMany({
    data: [
      { boardId: board.id, name: "Backlog", position: 0 },
      { boardId: board.id, name: "In Progress", position: 1 },
    ],
  });

  const [columns, groups] = await Promise.all([
    prisma.boardColumn.findMany({ where: { boardId: board.id }, orderBy: { position: "asc" } }),
    prisma.boardGroup.findMany({ where: { boardId: board.id }, orderBy: { position: "asc" } }),
  ]);

  if (groups.length < 2) {
    return board.id;
  }

  const statusColumn = columns.find((column) => column.type === BoardColumnType.STATUS);
  const textColumn = columns.find((column) => column.type === BoardColumnType.TEXT);
  const personColumn = columns.find((column) => column.type === BoardColumnType.PERSON);
  const dateColumn = columns.find((column) => column.type === BoardColumnType.DATE);

  const backlogItem = await prisma.boardItem.create({
    data: {
      boardId: board.id,
      groupId: groups[0].id,
      position: 0,
      name: "Define Stage 1 MVP scope",
      lastEditedById: userId,
    },
  });

  const inProgressItem = await prisma.boardItem.create({
    data: {
      boardId: board.id,
      groupId: groups[1].id,
      position: 0,
      name: "Set up production readiness checks",
      lastEditedById: userId,
    },
  });

  const values: Array<{
    itemId: string;
    columnId: string;
    textValue?: string;
    statusValue?: string;
    personId?: string;
    dateValue?: Date;
    updatedById: string;
  }> = [];

  if (textColumn) {
    values.push(
      {
        itemId: backlogItem.id,
        columnId: textColumn.id,
        textValue: "Capture must-have board editing capabilities",
        updatedById: userId,
      },
      {
        itemId: inProgressItem.id,
        columnId: textColumn.id,
        textValue: "Ensure health/readiness endpoints are monitored",
        updatedById: userId,
      },
    );
  }

  if (statusColumn) {
    values.push(
      {
        itemId: backlogItem.id,
        columnId: statusColumn.id,
        statusValue: "Not Started",
        updatedById: userId,
      },
      {
        itemId: inProgressItem.id,
        columnId: statusColumn.id,
        statusValue: "Working",
        updatedById: userId,
      },
    );
  }

  if (personColumn) {
    values.push(
      {
        itemId: backlogItem.id,
        columnId: personColumn.id,
        personId: userId,
        updatedById: userId,
      },
      {
        itemId: inProgressItem.id,
        columnId: personColumn.id,
        personId: userId,
        updatedById: userId,
      },
    );
  }

  if (dateColumn) {
    values.push(
      {
        itemId: backlogItem.id,
        columnId: dateColumn.id,
        dateValue: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
        updatedById: userId,
      },
      {
        itemId: inProgressItem.id,
        columnId: dateColumn.id,
        dateValue: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
        updatedById: userId,
      },
    );
  }

  if (values.length > 0) {
    await prisma.boardCellValue.createMany({ data: values });
  }

  return board.id;
}

export async function ensureStageOneBoard(userId: string) {
  const workspace = await getOrCreateWorkspace(userId);

  await prisma.workspaceMember.upsert({
    where: {
      workspaceId_userId: {
        workspaceId: workspace.id,
        userId,
      },
    },
    update: {
      role: WorkspaceRole.OWNER,
    },
    create: {
      workspaceId: workspace.id,
      userId,
      role: WorkspaceRole.OWNER,
    },
  });

  const existingBoard = await prisma.board.findFirst({
    where: {
      workspaceId: workspace.id,
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  const boardId = existingBoard?.id ?? (await createDefaultBoard(workspace.id, userId));
  const snapshot = await getBoardSnapshot(boardId);

  if (!snapshot) {
    throw new Error("Failed to bootstrap Stage 1 board");
  }

  return {
    snapshot,
    sessionUserId: userId,
  };
}
