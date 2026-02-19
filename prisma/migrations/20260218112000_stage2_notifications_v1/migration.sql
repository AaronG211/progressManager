-- CreateEnum
CREATE TYPE "public"."WorkspaceNotificationType" AS ENUM ('MENTION', 'ASSIGNMENT_CHANGED');

-- CreateTable
CREATE TABLE "public"."WorkspaceNotification" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "type" "public"."WorkspaceNotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkspaceNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkspaceNotification_workspaceId_createdAt_idx" ON "public"."WorkspaceNotification"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "WorkspaceNotification_userId_readAt_createdAt_idx" ON "public"."WorkspaceNotification"("userId", "readAt", "createdAt");

-- AddForeignKey
ALTER TABLE "public"."WorkspaceNotification" ADD CONSTRAINT "WorkspaceNotification_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkspaceNotification" ADD CONSTRAINT "WorkspaceNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkspaceNotification" ADD CONSTRAINT "WorkspaceNotification_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
