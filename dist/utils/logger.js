"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logAudit = logAudit;
const db_1 = require("./db");
async function logAudit(userId, action, details, ipAddress, userAgent) {
    try {
        await db_1.prisma.auditLog.create({
            data: {
                userId,
                action,
                details,
                ipAddress,
                userAgent,
            },
        });
        console.log(`[AUDIT] User: ${userId || 'SYSTEM'} | Action: ${action} | Details: ${details}`);
    }
    catch (error) {
        console.error('Failed to create audit log:', error);
    }
}
