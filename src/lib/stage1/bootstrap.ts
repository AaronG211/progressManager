import { BoardColumnType, WorkspaceRole } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  getBoardSnapshotWithPageInfo,
  type BoardSnapshotPaginationOptions,
} from "@/lib/stage1/board-query";

const defaultStatusOptions = [
  { label: "Not Started", color: "slate" },
  { label: "Working", color: "amber" },
  { label: "Blocked", color: "rose" },
  { label: "Done", color: "emerald" },
];

const defaultBoardViews = [
  { name: "Table", type: "TABLE" as const },
  { name: "Kanban", type: "KANBAN" as const },
  { name: "Calendar", type: "CALENDAR" as const },
  { name: "Timeline", type: "TIMELINE" as const },
];

const stageThreeColumnDefaults: Array<{
  name: string;
  type: BoardColumnType;
}> = [
  { name: "Estimate", type: BoardColumnType.NUMBER },
  { name: "Tags", type: BoardColumnType.TAGS },
  { name: "Done", type: BoardColumnType.CHECKBOX },
  { name: "Reference URL", type: BoardColumnType.URL },
];

async function getOrCreateWorkspace(userId: string) {
  const existingMembership = await prisma.workspaceMember.findFirst({
    where: {
      userId,
    },
    include: {
      workspace: true,
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  if (existingMembership) {
    return existingMembership.workspace;
  }

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
      {
        boardId: board.id,
        name: "Estimate",
        type: BoardColumnType.NUMBER,
        position: 4,
      },
      {
        boardId: board.id,
        name: "Tags",
        type: BoardColumnType.TAGS,
        position: 5,
      },
      {
        boardId: board.id,
        name: "Done",
        type: BoardColumnType.CHECKBOX,
        position: 6,
      },
      {
        boardId: board.id,
        name: "Reference URL",
        type: BoardColumnType.URL,
        position: 7,
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
  const numberColumn = columns.find((column) => column.type === BoardColumnType.NUMBER);
  const tagsColumn = columns.find((column) => column.type === BoardColumnType.TAGS);
  const checkboxColumn = columns.find((column) => column.type === BoardColumnType.CHECKBOX);
  const urlColumn = columns.find((column) => column.type === BoardColumnType.URL);

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
    numberValue?: number;
    tagsValue?: string[];
    checkboxValue?: boolean;
    urlValue?: string;
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

  if (numberColumn) {
    values.push(
      {
        itemId: backlogItem.id,
        columnId: numberColumn.id,
        numberValue: 5,
        updatedById: userId,
      },
      {
        itemId: inProgressItem.id,
        columnId: numberColumn.id,
        numberValue: 3,
        updatedById: userId,
      },
    );
  }

  if (tagsColumn) {
    values.push(
      {
        itemId: backlogItem.id,
        columnId: tagsColumn.id,
        tagsValue: ["MVP", "Planning"],
        updatedById: userId,
      },
      {
        itemId: inProgressItem.id,
        columnId: tagsColumn.id,
        tagsValue: ["Infra"],
        updatedById: userId,
      },
    );
  }

  if (checkboxColumn) {
    values.push(
      {
        itemId: backlogItem.id,
        columnId: checkboxColumn.id,
        checkboxValue: false,
        updatedById: userId,
      },
      {
        itemId: inProgressItem.id,
        columnId: checkboxColumn.id,
        checkboxValue: true,
        updatedById: userId,
      },
    );
  }

  if (urlColumn) {
    values.push(
      {
        itemId: backlogItem.id,
        columnId: urlColumn.id,
        urlValue: "https://www.notion.so/",
        updatedById: userId,
      },
      {
        itemId: inProgressItem.id,
        columnId: urlColumn.id,
        urlValue: "https://vercel.com/docs",
        updatedById: userId,
      },
    );
  }

  if (values.length > 0) {
    await prisma.boardCellValue.createMany({ data: values });
  }

  await prisma.boardView.createMany({
    data: defaultBoardViews.map((view, index) => ({
      boardId: board.id,
      name: view.name,
      type: view.type,
      position: index,
    })),
  });

  return board.id;
}

async function ensureDefaultBoardViews(boardId: string): Promise<void> {
  const existingCount = await prisma.boardView.count({
    where: {
      boardId,
    },
  });

  if (existingCount > 0) {
    return;
  }

  await prisma.boardView.createMany({
    data: defaultBoardViews.map((view, index) => ({
      boardId,
      name: view.name,
      type: view.type,
      position: index,
    })),
  });
}

async function ensureStageThreeColumns(boardId: string): Promise<void> {
  const existingColumns = await prisma.boardColumn.findMany({
    where: {
      boardId,
    },
    orderBy: {
      position: "asc",
    },
    select: {
      position: true,
      type: true,
    },
  });

  const existingTypes = new Set(existingColumns.map((column) => column.type));
  const missingColumns = stageThreeColumnDefaults.filter((definition) => !existingTypes.has(definition.type));

  if (missingColumns.length === 0) {
    return;
  }

  const nextBasePosition =
    existingColumns.length > 0
      ? Math.max(...existingColumns.map((column) => column.position)) + 1
      : 0;

  await prisma.boardColumn.createMany({
    data: missingColumns.map((definition, index) => ({
      boardId,
      name: definition.name,
      type: definition.type,
      position: nextBasePosition + index,
    })),
  });
}

export async function ensureStageOneBoard(
  userId: string,
  snapshotOptions?: BoardSnapshotPaginationOptions,
) {
  const workspace = await getOrCreateWorkspace(userId);

  const existingMembership = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId: workspace.id,
        userId,
      },
    },
    select: {
      id: true,
      role: true,
    },
  });

  if (!existingMembership) {
    await prisma.workspaceMember.create({
      data: {
        workspaceId: workspace.id,
        userId,
        role: workspace.ownerId === userId ? WorkspaceRole.OWNER : WorkspaceRole.MEMBER,
      },
    });
  } else if (workspace.ownerId === userId && existingMembership.role !== WorkspaceRole.OWNER) {
    await prisma.workspaceMember.update({
      where: {
        id: existingMembership.id,
      },
      data: {
        role: WorkspaceRole.OWNER,
      },
    });
  }

  const existingBoard = await prisma.board.findFirst({
    where: {
      workspaceId: workspace.id,
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  const boardId = existingBoard?.id ?? (await createDefaultBoard(workspace.id, userId));
  await ensureDefaultBoardViews(boardId);
  await ensureStageThreeColumns(boardId);
  const boardSnapshot = await getBoardSnapshotWithPageInfo(boardId, snapshotOptions);

  if (!boardSnapshot) {
    throw new Error("Failed to bootstrap Stage 1 board");
  }

  return {
    boardId,
    snapshot: boardSnapshot.snapshot,
    pageInfo: boardSnapshot.pageInfo,
    sessionUserId: userId,
  };
}
