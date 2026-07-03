"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createNotification = createNotification;
const db_1 = require("./db");
async function createNotification(userId, title, message, type = 'INFO') {
    try {
        const notification = await db_1.prisma.notification.create({
            data: {
                userId,
                title,
                message,
                type,
            },
        });
        console.log(`[NOTIFICATION] User ID: ${userId} | Type: ${type} | ${title}: ${message}`);
        return notification;
    }
    catch (error) {
        console.error('Failed to create notification:', error);
    }
}
