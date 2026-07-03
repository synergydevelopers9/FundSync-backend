import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../utils/db';
import { AuthRequest } from '../middleware/auth.middleware';
import { logAudit } from '../utils/logger';

const planSchema = z.object({
  name: z.string().min(2, 'Plan name must be at least 2 characters'),
  monthlyAmount: z.number().positive('Monthly amount must be a positive number'),
  description: z.string().min(5, 'Description must be at least 5 characters'),
  renewalCycle: z.enum(['MONTHLY', 'QUARTERLY', 'YEARLY']),
  benefits: z.array(z.string()).min(1, 'At least one benefit is required'),
  colorLabel: z.string().default('brand'),
});

export async function createPlan(req: AuthRequest, res: Response) {
  try {
    const validated = planSchema.parse(req.body);

    const plan = await prisma.plan.create({
      data: {
        name: validated.name,
        monthlyAmount: validated.monthlyAmount,
        description: validated.description,
        renewalCycle: validated.renewalCycle,
        benefits: JSON.stringify(validated.benefits),
        colorLabel: validated.colorLabel,
      },
    });

    await logAudit(req.user?.userId || null, 'PLAN_CREATE', `Created plan: ${plan.name} ($${plan.monthlyAmount}/mo)`);

    return res.status(201).json(plan);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('Create plan error:', error);
    return res.status(500).json({ error: 'Failed to create plan' });
  }
}

export async function getPlans(req: AuthRequest, res: Response) {
  try {
    const showAll = req.user?.role === 'ADMIN';

    const plans = await prisma.plan.findMany({
      where: showAll ? { deletedAt: null } : { status: 'ACTIVE', deletedAt: null },
      orderBy: { monthlyAmount: 'asc' },
    });

    // Parse benefits back to array before sending
    const parsedPlans = plans.map(p => ({
      ...p,
      benefits: JSON.parse(p.benefits),
    }));

    return res.json(parsedPlans);
  } catch (error) {
    console.error('Get plans error:', error);
    return res.status(500).json({ error: 'Failed to retrieve plans' });
  }
}

export async function getPlanById(req: Request, res: Response) {
  try {
    const plan = await prisma.plan.findUnique({
      where: { id: req.params.id },
    });

    if (!plan || plan.deletedAt !== null) {
      return res.status(404).json({ error: 'Plan not found' });
    }

    return res.json({
      ...plan,
      benefits: JSON.parse(plan.benefits),
    });
  } catch (error) {
    console.error('Get plan error:', error);
    return res.status(500).json({ error: 'Failed to retrieve plan' });
  }
}

export async function updatePlan(req: AuthRequest, res: Response) {
  try {
    const validated = planSchema.parse(req.body);

    const existing = await prisma.plan.findUnique({
      where: { id: req.params.id },
    });

    if (!existing || existing.deletedAt !== null) {
      return res.status(404).json({ error: 'Plan not found' });
    }

    const updated = await prisma.plan.update({
      where: { id: req.params.id },
      data: {
        name: validated.name,
        monthlyAmount: validated.monthlyAmount,
        description: validated.description,
        renewalCycle: validated.renewalCycle,
        benefits: JSON.stringify(validated.benefits),
        colorLabel: validated.colorLabel,
      },
    });

    await logAudit(req.user?.userId || null, 'PLAN_UPDATE', `Updated plan: ${updated.name}`);

    return res.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('Update plan error:', error);
    return res.status(500).json({ error: 'Failed to update plan' });
  }
}

export async function togglePlanStatus(req: AuthRequest, res: Response) {
  try {
    const { status } = req.body;
    if (!['ACTIVE', 'DEACTIVATED', 'ARCHIVED'].includes(status)) {
      return res.status(400).json({ error: 'Invalid plan status value' });
    }

    const plan = await prisma.plan.findUnique({
      where: { id: req.params.id },
    });

    if (!plan || plan.deletedAt !== null) {
      return res.status(404).json({ error: 'Plan not found' });
    }

    const updated = await prisma.plan.update({
      where: { id: req.params.id },
      data: { status },
    });

    await logAudit(req.user?.userId || null, 'PLAN_STATUS_CHANGE', `Toggled plan status for ${plan.name} to ${status}`);

    return res.json(updated);
  } catch (error) {
    console.error('Toggle plan status error:', error);
    return res.status(500).json({ error: 'Failed to alter plan status' });
  }
}

export async function deletePlan(req: AuthRequest, res: Response) {
  try {
    const plan = await prisma.plan.findUnique({
      where: { id: req.params.id },
    });

    if (!plan || plan.deletedAt !== null) {
      return res.status(404).json({ error: 'Plan not found' });
    }

    // Soft delete
    await prisma.plan.update({
      where: { id: req.params.id },
      data: { deletedAt: new Date(), status: 'ARCHIVED' },
    });

    await logAudit(req.user?.userId || null, 'PLAN_DELETE', `Deleted plan: ${plan.name}`);

    return res.json({ message: 'Plan has been successfully deleted' });
  } catch (error) {
    console.error('Delete plan error:', error);
    return res.status(500).json({ error: 'Failed to delete plan' });
  }
}
