import { prisma } from './db';

export async function logAudit(
  userId: string | null,
  action: string,
  details: string,
  ipAddress?: string,
  userAgent?: string
) {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        action,
        details,
        ipAddress,
        userAgent,
      },
    });
    console.log(`[AUDIT] User: ${userId || 'SYSTEM'} | Action: ${action} | Details: ${details}`);
  } catch (error) {
    console.error('Failed to create audit log:', error);
  }
}
