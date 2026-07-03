"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDashboardStats = getDashboardStats;
exports.getProfile = getProfile;
exports.updateProfile = updateProfile;
exports.changePassword = changePassword;
exports.getPayments = getPayments;
exports.getNotifications = getNotifications;
exports.markNotificationsRead = markNotificationsRead;
exports.getSupportTickets = getSupportTickets;
exports.createSupportTicket = createSupportTicket;
exports.subscribePlan = subscribePlan;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const zod_1 = require("zod");
const db_1 = require("../utils/db");
const logger_1 = require("../utils/logger");
const updateProfileSchema = zod_1.z.object({
    fullName: zod_1.z.string().min(2, 'Name must be at least 2 characters'),
    fatherName: zod_1.z.string().optional(),
    mobile: zod_1.z.string().regex(/^\+?[1-9]\d{1,14}$/, 'Invalid mobile phone number format'),
    dateOfBirth: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date of Birth must be YYYY-MM-DD'),
    gender: zod_1.z.string().min(1, 'Gender is required'),
    address: zod_1.z.string().min(5, 'Address must be at least 5 characters'),
    city: zod_1.z.string().min(2, 'City is required'),
    state: zod_1.z.string().min(2, 'State is required'),
    pinCode: zod_1.z.string().regex(/^\d{4,8}$/, 'PIN Code must be 4 to 8 digits'),
    profilePhoto: zod_1.z.string().optional(),
});
const changePasswordSchema = zod_1.z.object({
    oldPassword: zod_1.z.string().min(1, 'Old password is required'),
    newPassword: zod_1.z.string().min(8, 'Password must be at least 8 characters')
        .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
        .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
        .regex(/[0-9]/, 'Password must contain at least one digit'),
});
const ticketSchema = zod_1.z.object({
    subject: zod_1.z.string().min(5, 'Subject must be at least 5 characters'),
    description: zod_1.z.string().min(10, 'Description must be at least 10 characters'),
    priority: zod_1.z.enum(['LOW', 'MEDIUM', 'HIGH']).default('MEDIUM'),
});
async function getDashboardStats(req, res) {
    try {
        const memberId = req.user?.memberId;
        if (!memberId) {
            return res.status(400).json({ error: 'Invalid member session' });
        }
        const member = await db_1.prisma.member.findUnique({
            where: { id: memberId },
            include: {
                plan: true,
                payments: {
                    orderBy: { date: 'desc' },
                    take: 5,
                },
            },
        });
        if (!member || member.deletedAt !== null) {
            return res.status(404).json({ error: 'Member not found' });
        }
        // Unread notifications
        const notifications = await db_1.prisma.notification.findMany({
            where: { userId: member.userId, isRead: false },
            orderBy: { createdAt: 'desc' },
            take: 5,
        });
        // Pinned announcements
        const announcements = await db_1.prisma.announcement.findMany({
            where: { targetRole: { in: ['ALL', 'MEMBER'] } },
            orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
            take: 3,
        });
        // Support ticket status
        const recentTickets = await db_1.prisma.supportTicket.findMany({
            where: { memberId },
            orderBy: { createdAt: 'desc' },
            take: 3,
        });
        // Calculations for monthly amounts
        const monthlyAmount = member.plan?.monthlyAmount || 0;
        const amountPaid = member.amountPaid;
        const pendingAmount = member.pendingAmount;
        // Check payment status based on dates
        let paymentStatus = 'PAID';
        if (pendingAmount > 0) {
            paymentStatus = 'PENDING';
            if (member.nextDueDate && new Date(member.nextDueDate) < new Date()) {
                paymentStatus = 'OVERDUE';
            }
        }
        return res.json({
            profile: {
                memberId: member.memberId,
                fullName: member.fullName,
                photo: member.profilePhoto,
                status: member.status,
                email: req.user?.userId ? (await db_1.prisma.user.findUnique({ where: { id: req.user.userId } }))?.email : '',
                planId: member.planId,
            },
            membership: {
                planName: member.plan?.name || 'No Active Plan',
                monthlyAmount,
                amountPaid,
                pendingAmount,
                nextDueDate: member.nextDueDate ? member.nextDueDate.toISOString() : null,
                paymentStatus,
            },
            recentPayments: member.payments,
            notifications,
            announcements,
            recentTickets,
        });
    }
    catch (error) {
        console.error('Member dashboard error:', error);
        return res.status(500).json({ error: 'Failed to build member dashboard stats' });
    }
}
async function getProfile(req, res) {
    try {
        const memberId = req.user?.memberId;
        const member = await db_1.prisma.member.findUnique({
            where: { id: memberId },
            include: {
                user: { select: { email: true, isActive: true } },
                plan: true,
            },
        });
        if (!member || member.deletedAt !== null) {
            return res.status(404).json({ error: 'Member not found' });
        }
        return res.json(member);
    }
    catch (error) {
        console.error('Get profile error:', error);
        return res.status(500).json({ error: 'Failed to retrieve profile' });
    }
}
async function updateProfile(req, res) {
    try {
        const memberId = req.user?.memberId;
        const validated = updateProfileSchema.parse(req.body);
        const member = await db_1.prisma.member.findUnique({ where: { id: memberId } });
        if (!member || member.deletedAt !== null) {
            return res.status(404).json({ error: 'Member not found' });
        }
        // Update Mobile check duplicates
        if (validated.mobile !== member.mobile) {
            const mobileExists = await db_1.prisma.member.findFirst({
                where: { mobile: validated.mobile, NOT: { id: memberId }, deletedAt: null },
            });
            if (mobileExists) {
                return res.status(400).json({ error: 'Mobile number is already in use' });
            }
        }
        const updated = await db_1.prisma.member.update({
            where: { id: memberId },
            data: {
                fullName: validated.fullName,
                fatherName: validated.fatherName,
                mobile: validated.mobile,
                dateOfBirth: validated.dateOfBirth,
                gender: validated.gender,
                address: validated.address,
                city: validated.city,
                state: validated.state,
                pinCode: validated.pinCode,
                profilePhoto: validated.profilePhoto,
            },
            include: { plan: true },
        });
        await (0, logger_1.logAudit)(req.user?.userId || null, 'MEMBER_PROFILE_UPDATE', `Member ${member.memberId} updated profile`);
        return res.json(updated);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({ error: error.errors[0].message });
        }
        console.error('Update profile error:', error);
        return res.status(500).json({ error: 'Failed to update profile' });
    }
}
async function changePassword(req, res) {
    try {
        const userId = req.user?.userId;
        const validated = changePasswordSchema.parse(req.body);
        const user = await db_1.prisma.user.findUnique({ where: { id: userId } });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        const isMatch = await bcryptjs_1.default.compare(validated.oldPassword, user.passwordHash);
        if (!isMatch) {
            return res.status(400).json({ error: 'Incorrect current password' });
        }
        const hashed = await bcryptjs_1.default.hash(validated.newPassword, 10);
        await db_1.prisma.user.update({
            where: { id: userId },
            data: { passwordHash: hashed },
        });
        await (0, logger_1.logAudit)(userId || null, 'PASSWORD_CHANGE', 'User changed their password from settings');
        return res.json({ message: 'Password updated successfully' });
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({ error: error.errors[0].message });
        }
        console.error('Change password error:', error);
        return res.status(500).json({ error: 'Failed to change password' });
    }
}
async function getPayments(req, res) {
    try {
        const memberId = req.user?.memberId;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;
        const [payments, total] = await db_1.prisma.$transaction([
            db_1.prisma.payment.findMany({
                where: { memberId, deletedAt: null },
                orderBy: { date: 'desc' },
                skip,
                take: limit,
            }),
            db_1.prisma.payment.count({
                where: { memberId, deletedAt: null },
            }),
        ]);
        return res.json({
            payments,
            pagination: {
                page,
                limit,
                totalPages: Math.ceil(total / limit),
                totalItems: total,
            },
        });
    }
    catch (error) {
        console.error('Member payments error:', error);
        return res.status(500).json({ error: 'Failed to retrieve payment records' });
    }
}
async function getNotifications(req, res) {
    try {
        const userId = req.user?.userId;
        const notifications = await db_1.prisma.notification.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
        });
        return res.json(notifications);
    }
    catch (error) {
        console.error('Get notifications error:', error);
        return res.status(500).json({ error: 'Failed to load notifications' });
    }
}
async function markNotificationsRead(req, res) {
    try {
        const userId = req.user?.userId;
        await db_1.prisma.notification.updateMany({
            where: { userId, isRead: false },
            data: { isRead: true },
        });
        return res.json({ message: 'Notifications marked as read' });
    }
    catch (error) {
        console.error('Mark read error:', error);
        return res.status(500).json({ error: 'Failed to clear notifications' });
    }
}
async function getSupportTickets(req, res) {
    try {
        const memberId = req.user?.memberId;
        const tickets = await db_1.prisma.supportTicket.findMany({
            where: { memberId, deletedAt: null },
            orderBy: { createdAt: 'desc' },
        });
        return res.json(tickets);
    }
    catch (error) {
        console.error('Get tickets error:', error);
        return res.status(500).json({ error: 'Failed to retrieve support tickets' });
    }
}
async function createSupportTicket(req, res) {
    try {
        const memberId = req.user?.memberId;
        const validated = ticketSchema.parse(req.body);
        const ticket = await db_1.prisma.supportTicket.create({
            data: {
                memberId: memberId,
                subject: validated.subject,
                description: validated.description,
                priority: validated.priority,
            },
        });
        await (0, logger_1.logAudit)(req.user?.userId || null, 'TICKET_CREATE', `Raised ticket: ${ticket.subject}`);
        return res.status(201).json(ticket);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({ error: error.errors[0].message });
        }
        console.error('Create ticket error:', error);
        return res.status(500).json({ error: 'Failed to open support ticket' });
    }
}
async function subscribePlan(req, res) {
    try {
        const memberId = req.user?.memberId;
        const { planId } = req.body;
        if (!planId) {
            return res.status(400).json({ error: 'Plan selection is required' });
        }
        const member = await db_1.prisma.member.findUnique({ where: { id: memberId } });
        if (!member || member.deletedAt !== null) {
            return res.status(404).json({ error: 'Member not found' });
        }
        const plan = await db_1.prisma.plan.findUnique({ where: { id: planId } });
        if (!plan || plan.status !== 'ACTIVE') {
            return res.status(404).json({ error: 'Selected plan is invalid or inactive' });
        }
        // Update member details
        const updatedMember = await db_1.prisma.member.update({
            where: { id: memberId },
            data: {
                planId: plan.id,
                nextDueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days billing cycle
                pendingAmount: plan.monthlyAmount,
            },
            include: { plan: true },
        });
        await (0, logger_1.logAudit)(req.user?.userId || null, 'MEMBER_SUBSCRIBE_PLAN', `Member ${member.memberId} subscribed to plan: ${plan.name}`);
        return res.json(updatedMember);
    }
    catch (error) {
        console.error('Subscribe plan error:', error);
        return res.status(500).json({ error: 'Failed to subscribe to membership plan' });
    }
}
