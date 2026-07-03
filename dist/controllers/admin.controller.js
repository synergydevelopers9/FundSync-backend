"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDashboardStats = getDashboardStats;
exports.getMembers = getMembers;
exports.getMemberProfile = getMemberProfile;
exports.updateMember = updateMember;
exports.deleteMember = deleteMember;
exports.resetMemberPassword = resetMemberPassword;
exports.createAnnouncement = createAnnouncement;
exports.deleteAnnouncement = deleteAnnouncement;
exports.getAuditLogs = getAuditLogs;
exports.exportMembersReport = exportMembersReport;
exports.exportRevenueReport = exportRevenueReport;
exports.triggerBackup = triggerBackup;
exports.createMember = createMember;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const zod_1 = require("zod");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const db_1 = require("../utils/db");
const logger_1 = require("../utils/logger");
const notifications_1 = require("../utils/notifications");
const report_service_1 = require("../services/report.service");
const auth_controller_1 = require("./auth.controller");
const editMemberSchema = zod_1.z.object({
    fullName: zod_1.z.string().min(2),
    mobile: zod_1.z.string(),
    email: zod_1.z.string().email(),
    planId: zod_1.z.string().nullable().optional(),
    status: zod_1.z.enum(['ACTIVE', 'INACTIVE', 'DEACTIVATED']),
    nextDueDate: zod_1.z.string().nullable().optional(),
    address: zod_1.z.string(),
    city: zod_1.z.string(),
    state: zod_1.z.string(),
    pinCode: zod_1.z.string(),
});
const announcementSchema = zod_1.z.object({
    title: zod_1.z.string().min(3),
    content: zod_1.z.string().min(5),
    targetRole: zod_1.z.enum(['ALL', 'MEMBER', 'ADMIN']).default('ALL'),
    isPinned: zod_1.z.boolean().default(false),
});
async function getDashboardStats(req, res) {
    try {
        // 1. Widget Aggregations
        const totalMembers = await db_1.prisma.member.count({ where: { deletedAt: null } });
        const activeMembers = await db_1.prisma.member.count({ where: { status: 'ACTIVE', deletedAt: null } });
        const inactiveMembers = await db_1.prisma.member.count({ where: { status: 'INACTIVE', deletedAt: null } });
        // Today's collections
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        const todayPayments = await db_1.prisma.payment.findMany({
            where: { status: 'SUCCESS', date: { gte: startOfToday }, deletedAt: null },
            select: { amount: true },
        });
        const todayCollections = todayPayments.reduce((acc, curr) => acc + curr.amount, 0);
        // Monthly Revenue (current calendar month)
        const startOfThisMonth = new Date();
        startOfThisMonth.setDate(1);
        startOfThisMonth.setHours(0, 0, 0, 0);
        const monthPayments = await db_1.prisma.payment.findMany({
            where: { status: 'SUCCESS', date: { gte: startOfThisMonth }, deletedAt: null },
            select: { amount: true },
        });
        const monthlyRevenue = monthPayments.reduce((acc, curr) => acc + curr.amount, 0);
        // Total Revenue
        const allPayments = await db_1.prisma.payment.findMany({
            where: { status: 'SUCCESS', deletedAt: null },
            select: { amount: true },
        });
        const totalRevenue = allPayments.reduce((acc, curr) => acc + curr.amount, 0);
        // Total Pending Amount
        const pendingAmountTotalQuery = await db_1.prisma.member.findMany({
            where: { deletedAt: null },
            select: { pendingAmount: true },
        });
        const pendingPayments = pendingAmountTotalQuery.reduce((acc, curr) => acc + curr.pendingAmount, 0);
        // Upcoming renewals (due in next 7 days)
        const sevenDaysFromNow = new Date();
        sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
        const upcomingRenewals = await db_1.prisma.member.count({
            where: {
                status: 'ACTIVE',
                nextDueDate: { gte: new Date(), lte: sevenDaysFromNow },
                deletedAt: null,
            },
        });
        // 2. Recent lists
        const recentRegistrations = await db_1.prisma.member.findMany({
            where: { deletedAt: null },
            orderBy: { createdAt: 'desc' },
            take: 5,
            include: { plan: { select: { name: true } } },
        });
        const recentPayments = await db_1.prisma.payment.findMany({
            where: { deletedAt: null },
            orderBy: { date: 'desc' },
            take: 5,
            include: { member: { select: { fullName: true, memberId: true } } },
        });
        // 3. Analytics Charts Data (Last 6 Months Revenue Trends)
        const chartData = [];
        for (let i = 5; i >= 0; i--) {
            const d = new Date();
            d.setMonth(d.getMonth() - i);
            const year = d.getFullYear();
            const monthIndex = d.getMonth();
            const start = new Date(year, monthIndex, 1);
            const end = new Date(year, monthIndex + 1, 0, 23, 59, 59);
            const pays = await db_1.prisma.payment.findMany({
                where: { status: 'SUCCESS', date: { gte: start, lte: end }, deletedAt: null },
                select: { amount: true },
            });
            const rev = pays.reduce((sum, current) => sum + current.amount, 0);
            // Member count cumulative at that month end
            const memCount = await db_1.prisma.member.count({
                where: { createdAt: { lte: end }, deletedAt: null },
            });
            const monthName = d.toLocaleString('default', { month: 'short' });
            chartData.push({ month: monthName, revenue: rev, members: memCount });
        }
        // 4. Plan stats distribution (Members per plan)
        const plans = await db_1.prisma.plan.findMany({ where: { deletedAt: null }, include: { _count: { select: { members: true } } } });
        const planDistribution = plans.map(p => ({
            name: p.name,
            value: p._count.members,
            color: p.colorLabel,
        }));
        return res.json({
            widgets: {
                totalMembers,
                activeMembers,
                inactiveMembers,
                todayCollections,
                monthlyRevenue,
                totalRevenue,
                pendingPayments,
                upcomingRenewals,
            },
            charts: {
                monthlyTrends: chartData,
                planDistribution,
            },
            recentRegistrations,
            recentPayments,
        });
    }
    catch (error) {
        console.error('Admin dashboard stats error:', error);
        return res.status(500).json({ error: 'Failed to build admin dashboard stats' });
    }
}
async function getMembers(req, res) {
    try {
        const search = req.query.search || '';
        const planId = req.query.planId || '';
        const status = req.query.status || '';
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;
        const whereClause = {
            deletedAt: null,
            AND: [],
        };
        if (search) {
            whereClause.AND.push({
                OR: [
                    { fullName: { contains: search } },
                    { memberId: { contains: search } },
                    { mobile: { contains: search } },
                    { user: { email: { contains: search } } },
                ],
            });
        }
        if (planId) {
            whereClause.AND.push({ planId });
        }
        if (status) {
            whereClause.AND.push({ status });
        }
        if (whereClause.AND.length === 0) {
            delete whereClause.AND;
        }
        const [members, total] = await db_1.prisma.$transaction([
            db_1.prisma.member.findMany({
                where: whereClause,
                include: {
                    user: { select: { email: true, isActive: true } },
                    plan: { select: { name: true, monthlyAmount: true } },
                },
                orderBy: { memberId: 'asc' },
                skip,
                take: limit,
            }),
            db_1.prisma.member.count({ where: whereClause }),
        ]);
        return res.json({
            members,
            pagination: {
                page,
                limit,
                totalPages: Math.ceil(total / limit),
                totalItems: total,
            },
        });
    }
    catch (error) {
        console.error('Get members error:', error);
        return res.status(500).json({ error: 'Failed to query members list' });
    }
}
async function getMemberProfile(req, res) {
    try {
        const member = await db_1.prisma.member.findUnique({
            where: { id: req.params.id },
            include: {
                user: { select: { email: true, isActive: true } },
                plan: true,
                payments: { orderBy: { date: 'desc' } },
                tickets: { orderBy: { createdAt: 'desc' } },
            },
        });
        if (!member || member.deletedAt !== null) {
            return res.status(404).json({ error: 'Member not found' });
        }
        return res.json(member);
    }
    catch (error) {
        console.error('Get member profile error:', error);
        return res.status(500).json({ error: 'Failed to retrieve member profile' });
    }
}
async function updateMember(req, res) {
    try {
        const validated = editMemberSchema.parse(req.body);
        const memberId = req.params.id;
        const existing = await db_1.prisma.member.findUnique({
            where: { id: memberId },
            include: { user: true },
        });
        if (!existing || existing.deletedAt !== null) {
            return res.status(404).json({ error: 'Member not found' });
        }
        // Handle Email update if modified
        if (validated.email !== existing.user.email) {
            const emailInUse = await db_1.prisma.user.findFirst({
                where: { email: validated.email, NOT: { id: existing.userId }, deletedAt: null },
            });
            if (emailInUse) {
                return res.status(400).json({ error: 'Email is already in use' });
            }
        }
        // Handle Mobile update if modified
        if (validated.mobile !== existing.mobile) {
            const mobileInUse = await db_1.prisma.member.findFirst({
                where: { mobile: validated.mobile, NOT: { id: memberId }, deletedAt: null },
            });
            if (mobileInUse) {
                return res.status(400).json({ error: 'Mobile number is already in use' });
            }
        }
        // Check plan change and update dues
        let pendingDues = existing.pendingAmount;
        if (validated.planId !== existing.planId) {
            if (validated.planId) {
                const plan = await db_1.prisma.plan.findUnique({ where: { id: validated.planId } });
                if (plan) {
                    pendingDues = plan.monthlyAmount;
                }
            }
            else {
                pendingDues = 0;
            }
        }
        await db_1.prisma.$transaction([
            db_1.prisma.user.update({
                where: { id: existing.userId },
                data: {
                    email: validated.email,
                    isActive: validated.status === 'ACTIVE',
                },
            }),
            db_1.prisma.member.update({
                where: { id: memberId },
                data: {
                    fullName: validated.fullName,
                    mobile: validated.mobile,
                    status: validated.status,
                    planId: validated.planId,
                    pendingAmount: pendingDues,
                    nextDueDate: validated.nextDueDate ? new Date(validated.nextDueDate) : null,
                    address: validated.address,
                    city: validated.city,
                    state: validated.state,
                    pinCode: validated.pinCode,
                },
            }),
        ]);
        await (0, logger_1.logAudit)(req.user?.userId || null, 'MEMBER_UPDATE', `Admin updated member profile for ${existing.memberId}`);
        return res.json({ message: 'Member profile updated successfully' });
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({ error: error.errors[0].message });
        }
        console.error('Update member error:', error);
        return res.status(500).json({ error: 'Failed to update member profile' });
    }
}
async function deleteMember(req, res) {
    try {
        const member = await db_1.prisma.member.findUnique({
            where: { id: req.params.id },
        });
        if (!member || member.deletedAt !== null) {
            return res.status(404).json({ error: 'Member not found' });
        }
        // Soft delete user & member in transactional lock
        await db_1.prisma.$transaction([
            db_1.prisma.user.update({
                where: { id: member.userId },
                data: { deletedAt: new Date(), isActive: false },
            }),
            db_1.prisma.member.update({
                where: { id: member.id },
                data: { deletedAt: new Date(), status: 'DEACTIVATED' },
            }),
        ]);
        await (0, logger_1.logAudit)(req.user?.userId || null, 'MEMBER_DELETE', `Soft deleted member ${member.memberId}`);
        return res.json({ message: 'Member has been successfully deleted' });
    }
    catch (error) {
        console.error('Delete member error:', error);
        return res.status(500).json({ error: 'Failed to delete member' });
    }
}
async function resetMemberPassword(req, res) {
    try {
        const { newPassword } = req.body;
        if (!newPassword || newPassword.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters' });
        }
        const member = await db_1.prisma.member.findUnique({ where: { id: req.params.id } });
        if (!member) {
            return res.status(404).json({ error: 'Member not found' });
        }
        const hashed = await bcryptjs_1.default.hash(newPassword, 10);
        await db_1.prisma.user.update({
            where: { id: member.userId },
            data: { passwordHash: hashed },
        });
        await (0, logger_1.logAudit)(req.user?.userId || null, 'ADMIN_RESET_PASSWORD', `Admin reset password for member: ${member.memberId}`);
        await (0, notifications_1.createNotification)(member.userId, 'Password Reset By Admin', 'An administrator has reset your account password. Please change it on your next login.', 'SYSTEM');
        return res.json({ message: 'Password has been reset successfully' });
    }
    catch (error) {
        console.error('Admin reset password error:', error);
        return res.status(500).json({ error: 'Failed to reset password' });
    }
}
// Announcements management
async function createAnnouncement(req, res) {
    try {
        const validated = announcementSchema.parse(req.body);
        const announce = await db_1.prisma.announcement.create({
            data: {
                title: validated.title,
                content: validated.content,
                targetRole: validated.targetRole,
                isPinned: validated.isPinned,
            },
        });
        await (0, logger_1.logAudit)(req.user?.userId || null, 'ANNOUNCEMENT_CREATE', `Created announcement: ${announce.title}`);
        // Create notifications for all target users
        const users = await db_1.prisma.user.findMany({
            where: validated.targetRole === 'ALL' ? { deletedAt: null } : { role: validated.targetRole, deletedAt: null },
        });
        for (const u of users) {
            await (0, notifications_1.createNotification)(u.id, `Announcement: ${validated.title}`, validated.content.substring(0, 100) + '...', 'SYSTEM');
        }
        return res.status(201).json(announce);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({ error: error.errors[0].message });
        }
        console.error('Create announcement error:', error);
        return res.status(500).json({ error: 'Failed to create announcement' });
    }
}
async function deleteAnnouncement(req, res) {
    try {
        const announce = await db_1.prisma.announcement.delete({
            where: { id: req.params.id },
        });
        await (0, logger_1.logAudit)(req.user?.userId || null, 'ANNOUNCEMENT_DELETE', `Deleted announcement: ${announce.title}`);
        return res.json({ message: 'Announcement deleted' });
    }
    catch (error) {
        console.error('Delete announcement error:', error);
        return res.status(500).json({ error: 'Failed to delete announcement' });
    }
}
// Audit logs
async function getAuditLogs(req, res) {
    try {
        const logs = await db_1.prisma.auditLog.findMany({
            orderBy: { createdAt: 'desc' },
            include: { user: { select: { email: true, role: true } } },
            take: 100,
        });
        return res.json(logs);
    }
    catch (error) {
        console.error('Get audits error:', error);
        return res.status(500).json({ error: 'Failed to load system audit logs' });
    }
}
// Reports Excel Exports
async function exportMembersReport(req, res) {
    try {
        const members = await db_1.prisma.member.findMany({
            where: { deletedAt: null },
            include: { user: true },
        });
        const fileUrl = await (0, report_service_1.generateMembersReportExcel)(members);
        await (0, logger_1.logAudit)(req.user?.userId || null, 'REPORT_EXPORT', 'Exported members roster report');
        return res.json({ fileUrl });
    }
    catch (error) {
        console.error('Export members error:', error);
        return res.status(500).json({ error: 'Failed to build Excel report' });
    }
}
async function exportRevenueReport(req, res) {
    try {
        const payments = await db_1.prisma.payment.findMany({
            where: { deletedAt: null },
            include: { member: true },
            orderBy: { date: 'desc' },
        });
        const fileUrl = await (0, report_service_1.generateRevenueReportExcel)(payments);
        await (0, logger_1.logAudit)(req.user?.userId || null, 'REPORT_EXPORT', 'Exported revenue collections report');
        return res.json({ fileUrl });
    }
    catch (error) {
        console.error('Export revenue error:', error);
        return res.status(500).json({ error: 'Failed to build Excel report' });
    }
}
// Database Backup triggers
async function triggerBackup(req, res) {
    try {
        const publicDir = path_1.default.join(__dirname, '../../public/backups');
        if (!fs_1.default.existsSync(publicDir)) {
            fs_1.default.mkdirSync(publicDir, { recursive: true });
        }
        const backupFile = `backup-${Date.now()}.sql`;
        const backupPath = path_1.default.join(publicDir, backupFile);
        // SQL dump simulation
        const backupDetails = {
            timestamp: new Date().toISOString(),
            status: 'SUCCESS',
            sqliteDbPath: './prisma/dev.db',
        };
        fs_1.default.writeFileSync(backupPath, JSON.stringify(backupDetails, null, 2));
        await (0, logger_1.logAudit)(req.user?.userId || null, 'DATABASE_BACKUP', `Triggered database backup: ${backupFile}`);
        return res.json({ message: 'Backup created successfully', backupFile });
    }
    catch (error) {
        console.error('Backup error:', error);
        return res.status(500).json({ error: 'Database backup failed' });
    }
}
const createMemberSchema = zod_1.z.object({
    fullName: zod_1.z.string().min(2, 'Name must be at least 2 characters'),
    email: zod_1.z.string().email('Invalid email address'),
    mobile: zod_1.z.string().regex(/^\+?[1-9]\d{1,14}$/, 'Invalid mobile phone number format'),
    dateOfBirth: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date of Birth must be YYYY-MM-DD'),
    gender: zod_1.z.string().min(1, 'Gender is required'),
    address: zod_1.z.string().min(5, 'Address must be at least 5 characters'),
    city: zod_1.z.string().min(2, 'City is required'),
    state: zod_1.z.string().min(2, 'State is required'),
    pinCode: zod_1.z.string().regex(/^\d{4,8}$/, 'PIN Code must be 4 to 8 digits'),
    planId: zod_1.z.string().nullable().optional(),
    password: zod_1.z.string().min(8, 'Password must be at least 8 characters').optional(),
});
async function createMember(req, res) {
    try {
        const validated = createMemberSchema.parse(req.body);
        // Prevent duplicates
        const emailExists = await db_1.prisma.user.findFirst({
            where: { email: validated.email, deletedAt: null },
        });
        if (emailExists) {
            return res.status(400).json({ error: 'Email is already registered' });
        }
        const mobileExists = await db_1.prisma.member.findFirst({
            where: { mobile: validated.mobile, deletedAt: null },
        });
        if (mobileExists) {
            return res.status(400).json({ error: 'Mobile number is already registered' });
        }
        const rawPassword = validated.password || 'SecurePassword123!';
        const passwordHash = await bcryptjs_1.default.hash(rawPassword, 10);
        const memberId = await (0, auth_controller_1.generateNextMemberId)();
        // Determine default plan variables
        let monthlyAmount = 0;
        if (validated.planId) {
            const plan = await db_1.prisma.plan.findUnique({
                where: { id: validated.planId },
            });
            if (plan) {
                monthlyAmount = plan.monthlyAmount;
            }
        }
        // Write transaction
        const result = await db_1.prisma.$transaction(async (tx) => {
            const user = await tx.user.create({
                data: {
                    email: validated.email,
                    passwordHash,
                    role: 'MEMBER',
                    isActive: true,
                },
            });
            const member = await tx.member.create({
                data: {
                    userId: user.id,
                    memberId,
                    fullName: validated.fullName,
                    mobile: validated.mobile,
                    dateOfBirth: validated.dateOfBirth,
                    gender: validated.gender,
                    address: validated.address,
                    city: validated.city,
                    state: validated.state,
                    pinCode: validated.pinCode,
                    planId: validated.planId || null,
                    nextDueDate: validated.planId ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) : null,
                    pendingAmount: monthlyAmount,
                    status: 'ACTIVE',
                },
                include: { plan: true },
            });
            return { user, member };
        });
        await (0, logger_1.logAudit)(req.user?.userId || null, 'ADMIN_CREATE_MEMBER', `Admin manually created member: ${result.member.memberId} (${result.member.fullName})`);
        return res.status(201).json(result.member);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({ error: error.errors[0].message });
        }
        console.error('Admin manually create member error:', error);
        return res.status(500).json({ error: 'Failed to manually add member' });
    }
}
