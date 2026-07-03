import { prisma } from './db';

export async function createNotification(
  userId: string,
  title: string,
  message: string,
  type: 'INFO' | 'PAYMENT' | 'DUE' | 'SYSTEM' = 'INFO'
) {
  try {
    const notification = await prisma.notification.create({
      data: {
        userId,
        title,
        message,
        type,
      },
    });

    console.log(`[NOTIFICATION] User ID: ${userId} | Type: ${type} | ${title}: ${message}`);
    return notification;
  } catch (error) {
    console.error('Failed to create notification:', error);
  }
}
