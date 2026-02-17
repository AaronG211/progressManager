import { prisma } from "@/lib/db/prisma";

const DEFAULT_STAGE1_EMAIL = "owner@progress.local";
const DEFAULT_STAGE1_NAME = "Demo Owner";

export async function getOrCreateSessionUser() {
  const email = process.env.STAGE1_DEV_USER_EMAIL?.trim() || DEFAULT_STAGE1_EMAIL;
  const name = process.env.STAGE1_DEV_USER_NAME?.trim() || DEFAULT_STAGE1_NAME;

  return prisma.user.upsert({
    where: { email },
    update: { name },
    create: {
      email,
      name,
    },
  });
}
