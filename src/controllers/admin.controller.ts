import { Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import path from 'path';
import fs from 'fs';
import { prisma } from '../utils/db';
import { AuthRequest } from '../middleware/auth.middleware';
import { logAudit } from '../utils/logger';
import { createNotification } from '../utils/notifications';
import { generateMembersReportExcel, generateRevenueReportExcel } from '../services/report.service';
import { generateNextMemberId } from './auth.controller';

const editMemberSchema = z.object({
  fullName: z.string().min(2),
  mobile: z.string(),
  email: z.string().email(),
  planId: z.string().nullable().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'DEACTIVATED']),
  nextDueDate: z.string().nullable().optional(),
  address: z.string(),
  city: z.string(),
  state: z.string(),
  pinCode: z.string(),
});

const announcementSchema = z.object({
  title: z.string().min(3),
  content: z.string().min(5),
  targetRole: z.enum(['ALL', 'MEMBER', 'ADMIN']).default('ALL'),
  isPinned: z.boolean().default(false),
});

export async function getDashboardStats(req: AuthRequest, res: Response) {
  try {
    // 1. Widget Aggregations
    const totalMembers = await prisma.member.count({ where: { deletedAt: null } });
    const activeMembers = await prisma.member.count({ where: { status: 'ACTIVE', deletedAt: null } });
    const inactiveMembers = await prisma.member.count({ where: { status: 'INACTIVE', deletedAt: null } });

    // Today's collections
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const todayPayments = await prisma.payment.findMany({
      where: { status: 'SUCCESS', date: { gte: startOfToday }, deletedAt: null },
      select: { amount: true },
    });
    const todayCollections = todayPayments.reduce((acc, curr) => acc + curr.amount, 0);

    // Monthly Revenue (current calendar month)
    const startOfThisMonth = new Date();
    startOfThisMonth.setDate(1);
    startOfThisMonth.setHours(0, 0, 0, 0);
    const monthPayments = await prisma.payment.findMany({
      where: { status: 'SUCCESS', date: { gte: startOfThisMonth }, deletedAt: null },
      select: { amount: true },
    });
    const monthlyRevenue = monthPayments.reduce((acc, curr) => acc + curr.amount, 0);

    // Total Revenue
    const allPayments = await prisma.payment.findMany({
      where: { status: 'SUCCESS', deletedAt: null },
      select: { amount: true },
    });
    const totalRevenue = allPayments.reduce((acc, curr) => acc + curr.amount, 0);

    // Total Pending Amount
    const pendingAmountTotalQuery = await prisma.member.findMany({
      where: { deletedAt: null },
      select: { pendingAmount: true },
    });
    const pendingPayments = pendingAmountTotalQuery.reduce((acc, curr) => acc + curr.pendingAmount, 0);

    // Upcoming renewals (due in next 7 days)
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
    const upcomingRenewals = await prisma.member.count({
      where: {
        status: 'ACTIVE',
        nextDueDate: { gte: new Date(), lte: sevenDaysFromNow },
        deletedAt: null,
      },
    });

    // 2. Recent lists
    const recentRegistrations = await prisma.member.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: { plan: { select: { name: true } } },
    });

    const recentPayments = await prisma.payment.findMany({
      where: { deletedAt: null },
      orderBy: { date: 'desc' },
      take: 5,
      include: { member: { select: { fullName: true, memberId: true } } },
    });

    // 3. Analytics Charts Data (Last 6 Months Revenue Trends)
    const chartData: { month: string; revenue: number; members: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const year = d.getFullYear();
      const monthIndex = d.getMonth();

      const start = new Date(year, monthIndex, 1);
      const end = new Date(year, monthIndex + 1, 0, 23, 59, 59);

      const pays = await prisma.payment.findMany({
        where: { status: 'SUCCESS', date: { gte: start, lte: end }, deletedAt: null },
        select: { amount: true },
      });
      const rev = pays.reduce((sum, current) => sum + current.amount, 0);

      // Member count cumulative at that month end
      const memCount = await prisma.member.count({
        where: { createdAt: { lte: end }, deletedAt: null },
      });

      const monthName = d.toLocaleString('default', { month: 'short' });
      chartData.push({ month: monthName, revenue: rev, members: memCount });
    }

    // 4. Plan stats distribution (Members per plan)
    const plans = await prisma.plan.findMany({ where: { deletedAt: null }, include: { _count: { select: { members: true } } } });
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
  } catch (error) {
    console.error('Admin dashboard stats error:', error);
    return res.status(500).json({ error: 'Failed to build admin dashboard stats' });
  }
}

export async function getMembers(req: AuthRequest, res: Response) {
  try {
    const search = (req.query.search as string) || '';
    const planId = (req.query.planId as string) || '';
    const status = (req.query.status as string) || '';
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    const whereClause: any = {
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

    const [members, total] = await prisma.$transaction([
      prisma.member.findMany({
        where: whereClause,
        include: {
          user: { select: { email: true, isActive: true } },
          plan: { select: { name: true, monthlyAmount: true } },
        },
        orderBy: { memberId: 'asc' },
        skip,
        take: limit,
      }),
      prisma.member.count({ where: whereClause }),
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
  } catch (error) {
    console.error('Get members error:', error);
    return res.status(500).json({ error: 'Failed to query members list' });
  }
}

export async function getMemberProfile(req: AuthRequest, res: Response) {
  try {
    const member = await prisma.member.findUnique({
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
  } catch (error) {
    console.error('Get member profile error:', error);
    return res.status(500).json({ error: 'Failed to retrieve member profile' });
  }
}

export async function updateMember(req: AuthRequest, res: Response) {
  try {
    const validated = editMemberSchema.parse(req.body);
    const memberId = req.params.id;

    const existing = await prisma.member.findUnique({
      where: { id: memberId },
      include: { user: true },
    });

    if (!existing || existing.deletedAt !== null) {
      return res.status(404).json({ error: 'Member not found' });
    }

    // Handle Email update if modified
    if (validated.email !== existing.user.email) {
      const emailInUse = await prisma.user.findFirst({
        where: { email: validated.email, NOT: { id: existing.userId }, deletedAt: null },
      });
      if (emailInUse) {
        return res.status(400).json({ error: 'Email is already in use' });
      }
    }

    // Handle Mobile update if modified
    if (validated.mobile !== existing.mobile) {
      const mobileInUse = await prisma.member.findFirst({
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
        const plan = await prisma.plan.findUnique({ where: { id: validated.planId } });
        if (plan) {
          pendingDues = plan.monthlyAmount;
        }
      } else {
        pendingDues = 0;
      }
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id: existing.userId },
        data: {
          email: validated.email,
          isActive: validated.status === 'ACTIVE',
        },
      }),
      prisma.member.update({
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

    await logAudit(req.user?.userId || null, 'MEMBER_UPDATE', `Admin updated member profile for ${existing.memberId}`);

    return res.json({ message: 'Member profile updated successfully' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('Update member error:', error);
    return res.status(500).json({ error: 'Failed to update member profile' });
  }
}

export async function deleteMember(req: AuthRequest, res: Response) {
  try {
    const member = await prisma.member.findUnique({
      where: { id: req.params.id },
    });

    if (!member || member.deletedAt !== null) {
      return res.status(404).json({ error: 'Member not found' });
    }

    // Soft delete user & member in transactional lock
    await prisma.$transaction([
      prisma.user.update({
        where: { id: member.userId },
        data: { deletedAt: new Date(), isActive: false },
      }),
      prisma.member.update({
        where: { id: member.id },
        data: { deletedAt: new Date(), status: 'DEACTIVATED' },
      }),
    ]);

    await logAudit(req.user?.userId || null, 'MEMBER_DELETE', `Soft deleted member ${member.memberId}`);

    return res.json({ message: 'Member has been successfully deleted' });
  } catch (error) {
    console.error('Delete member error:', error);
    return res.status(500).json({ error: 'Failed to delete member' });
  }
}

export async function resetMemberPassword(req: AuthRequest, res: Response) {
  try {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const member = await prisma.member.findUnique({ where: { id: req.params.id } });
    if (!member) {
      return res.status(404).json({ error: 'Member not found' });
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: member.userId },
      data: { passwordHash: hashed },
    });

    await logAudit(req.user?.userId || null, 'ADMIN_RESET_PASSWORD', `Admin reset password for member: ${member.memberId}`);
    await createNotification(
      member.userId,
      'Password Reset By Admin',
      'An administrator has reset your account password. Please change it on your next login.',
      'SYSTEM'
    );

    return res.json({ message: 'Password has been reset successfully' });
  } catch (error) {
    console.error('Admin reset password error:', error);
    return res.status(500).json({ error: 'Failed to reset password' });
  }
}

// Announcements management
export async function createAnnouncement(req: AuthRequest, res: Response) {
  try {
    const validated = announcementSchema.parse(req.body);

    const announce = await prisma.announcement.create({
      data: {
        title: validated.title,
        content: validated.content,
        targetRole: validated.targetRole,
        isPinned: validated.isPinned,
      },
    });

    await logAudit(req.user?.userId || null, 'ANNOUNCEMENT_CREATE', `Created announcement: ${announce.title}`);

    // Create notifications for all target users
    const users = await prisma.user.findMany({
      where: validated.targetRole === 'ALL' ? { deletedAt: null } : { role: validated.targetRole, deletedAt: null },
    });

    for (const u of users) {
      await createNotification(u.id, `Announcement: ${validated.title}`, validated.content.substring(0, 100) + '...', 'SYSTEM');
    }

    return res.status(201).json(announce);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('Create announcement error:', error);
    return res.status(500).json({ error: 'Failed to create announcement' });
  }
}

export async function deleteAnnouncement(req: AuthRequest, res: Response) {
  try {
    const announce = await prisma.announcement.delete({
      where: { id: req.params.id },
    });
    await logAudit(req.user?.userId || null, 'ANNOUNCEMENT_DELETE', `Deleted announcement: ${announce.title}`);
    return res.json({ message: 'Announcement deleted' });
  } catch (error) {
    console.error('Delete announcement error:', error);
    return res.status(500).json({ error: 'Failed to delete announcement' });
  }
}

// Audit logs
export async function getAuditLogs(req: AuthRequest, res: Response) {
  try {
    const logs = await prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { email: true, role: true } } },
      take: 100,
    });
    return res.json(logs);
  } catch (error) {
    console.error('Get audits error:', error);
    return res.status(500).json({ error: 'Failed to load system audit logs' });
  }
}

// Reports Excel Exports
export async function exportMembersReport(req: AuthRequest, res: Response) {
  try {
    const members = await prisma.member.findMany({
      where: { deletedAt: null },
      include: { user: true },
    });

    const fileUrl = await generateMembersReportExcel(members);
    await logAudit(req.user?.userId || null, 'REPORT_EXPORT', 'Exported members roster report');

    return res.json({ fileUrl });
  } catch (error) {
    console.error('Export members error:', error);
    return res.status(500).json({ error: 'Failed to build Excel report' });
  }
}

export async function exportRevenueReport(req: AuthRequest, res: Response) {
  try {
    const payments = await prisma.payment.findMany({
      where: { deletedAt: null },
      include: { member: true },
      orderBy: { date: 'desc' },
    });

    const fileUrl = await generateRevenueReportExcel(payments);
    await logAudit(req.user?.userId || null, 'REPORT_EXPORT', 'Exported revenue collections report');

    return res.json({ fileUrl });
  } catch (error) {
    console.error('Export revenue error:', error);
    return res.status(500).json({ error: 'Failed to build Excel report' });
  }
}

// Database Backup triggers
export async function triggerBackup(req: AuthRequest, res: Response) {
  try {
    const publicDir = path.join(__dirname, '../../public/backups');
    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true });
    }

    const backupFile = `backup-${Date.now()}.sql`;
    const backupPath = path.join(publicDir, backupFile);

    // SQL dump simulation
    const backupDetails = {
      timestamp: new Date().toISOString(),
      status: 'SUCCESS',
      sqliteDbPath: './prisma/dev.db',
    };

    fs.writeFileSync(backupPath, JSON.stringify(backupDetails, null, 2));
    await logAudit(req.user?.userId || null, 'DATABASE_BACKUP', `Triggered database backup: ${backupFile}`);

    return res.json({ message: 'Backup created successfully', backupFile });
  } catch (error) {
    console.error('Backup error:', error);
    return res.status(500).json({ error: 'Database backup failed' });
  }
}

const createMemberSchema = z.object({
  fullName: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  mobile: z.string().regex(/^\+?[1-9]\d{1,14}$/, 'Invalid mobile phone number format'),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date of Birth must be YYYY-MM-DD'),
  gender: z.string().min(1, 'Gender is required'),
  address: z.string().min(5, 'Address must be at least 5 characters'),
  city: z.string().min(2, 'City is required'),
  state: z.string().min(2, 'State is required'),
  pinCode: z.string().regex(/^\d{4,8}$/, 'PIN Code must be 4 to 8 digits'),
  planId: z.string().nullable().optional(),
  password: z.string().min(8, 'Password must be at least 8 characters').optional(),
});

export async function createMember(req: AuthRequest, res: Response) {
  try {
    const validated = createMemberSchema.parse(req.body);

    // Prevent duplicates
    const emailExists = await prisma.user.findFirst({
      where: { email: validated.email, deletedAt: null },
    });
    if (emailExists) {
      return res.status(400).json({ error: 'Email is already registered' });
    }

    const mobileExists = await prisma.member.findFirst({
      where: { mobile: validated.mobile, deletedAt: null },
    });
    if (mobileExists) {
      return res.status(400).json({ error: 'Mobile number is already registered' });
    }

    const rawPassword = validated.password || 'SecurePassword123!';
    const passwordHash = await bcrypt.hash(rawPassword, 10);
    const memberId = await generateNextMemberId();

    // Determine default plan variables
    let monthlyAmount = 0;
    if (validated.planId) {
      const plan = await prisma.plan.findUnique({
        where: { id: validated.planId },
      });
      if (plan) {
        monthlyAmount = plan.monthlyAmount;
      }
    }

    // Write transaction
    const result = await prisma.$transaction(async (tx) => {
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

    await logAudit(
      req.user?.userId || null,
      'ADMIN_CREATE_MEMBER',
      `Admin manually created member: ${result.member.memberId} (${result.member.fullName})`
    );

    return res.status(201).json(result.member);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('Admin manually create member error:', error);
    return res.status(500).json({ error: 'Failed to manually add member' });
  }
}
