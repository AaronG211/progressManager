-- CreateEnum
CREATE TYPE "public"."BoardViewType" AS ENUM ('TABLE', 'KANBAN', 'CALENDAR', 'TIMELINE');

-- CreateTable
CREATE TABLE "public"."BoardView" (
    "id" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "public"."BoardViewType" NOT NULL,
    "position" INTEGER NOT NULL,
    "config" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BoardView_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BoardView_boardId_position_key" ON "public"."BoardView"("boardId", "position");

-- AddForeignKey
ALTER TABLE "public"."BoardView" ADD CONSTRAINT "BoardView_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "public"."Board"("id") ON DELETE CASCADE ON UPDATE CASCADE;
