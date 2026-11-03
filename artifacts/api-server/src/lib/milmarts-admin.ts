import { and, eq } from "drizzle-orm";
import { db, milmartsAdminStaffTable } from "@workspace/db";

export function isMilmartsRootAdmin(userId: number) {
  const configuredUserId = Number(process.env.MILMARTS_ADMIN_USER_ID);
  return Number.isSafeInteger(configuredUserId) && configuredUserId > 0 && userId === configuredUserId;
}

export async function isMilmartsAdmin(userId: number) {
  if (isMilmartsRootAdmin(userId)) return true;
  const [staff] = await db.select({ userId: milmartsAdminStaffTable.userId })
    .from(milmartsAdminStaffTable)
    .where(and(
      eq(milmartsAdminStaffTable.userId, userId),
      eq(milmartsAdminStaffTable.isActive, true),
    ))
    .limit(1);
  return Boolean(staff);
}
