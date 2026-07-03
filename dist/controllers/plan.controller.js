"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPlan = createPlan;
exports.getPlans = getPlans;
exports.getPlanById = getPlanById;
exports.updatePlan = updatePlan;
exports.togglePlanStatus = togglePlanStatus;
exports.deletePlan = deletePlan;
const zod_1 = require("zod");
const db_1 = require("../utils/db");
const logger_1 = require("../utils/logger");
const planSchema = zod_1.z.object({
    name: zod_1.z.string().min(2, 'Plan name must be at least 2 characters'),
    monthlyAmount: zod_1.z.number().positive('Monthly amount must be a positive number'),
    description: zod_1.z.string().min(5, 'Description must be at least 5 characters'),
    renewalCycle: zod_1.z.enum(['MONTHLY', 'QUARTERLY', 'YEARLY']),
    benefits: zod_1.z.array(zod_1.z.string()).min(1, 'At least one benefit is required'),
    colorLabel: zod_1.z.string().default('brand'),
});
async function createPlan(req, res) {
    try {
        const validated = planSchema.parse(req.body);
        const plan = await db_1.prisma.plan.create({
            data: {
                name: validated.name,
                monthlyAmount: validated.monthlyAmount,
                description: validated.description,
                renewalCycle: validated.renewalCycle,
                benefits: JSON.stringify(validated.benefits),
                colorLabel: validated.colorLabel,
            },
        });
        await (0, logger_1.logAudit)(req.user?.userId || null, 'PLAN_CREATE', `Created plan: ${plan.name} ($${plan.monthlyAmount}/mo)`);
        return res.status(201).json(plan);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({ error: error.errors[0].message });
        }
        console.error('Create plan error:', error);
        return res.status(500).json({ error: 'Failed to create plan' });
    }
}
async function getPlans(req, res) {
    try {
        const showAll = req.user?.role === 'ADMIN';
        const plans = await db_1.prisma.plan.findMany({
            where: showAll ? { deletedAt: null } : { status: 'ACTIVE', deletedAt: null },
            orderBy: { monthlyAmount: 'asc' },
        });
        // Parse benefits back to array before sending
        const parsedPlans = plans.map(p => ({
            ...p,
            benefits: JSON.parse(p.benefits),
        }));
        return res.json(parsedPlans);
    }
    catch (error) {
        console.error('Get plans error:', error);
        return res.status(500).json({ error: 'Failed to retrieve plans' });
    }
}
async function getPlanById(req, res) {
    try {
        const plan = await db_1.prisma.plan.findUnique({
            where: { id: req.params.id },
        });
        if (!plan || plan.deletedAt !== null) {
            return res.status(404).json({ error: 'Plan not found' });
        }
        return res.json({
            ...plan,
            benefits: JSON.parse(plan.benefits),
        });
    }
    catch (error) {
        console.error('Get plan error:', error);
        return res.status(500).json({ error: 'Failed to retrieve plan' });
    }
}
async function updatePlan(req, res) {
    try {
        const validated = planSchema.parse(req.body);
        const existing = await db_1.prisma.plan.findUnique({
            where: { id: req.params.id },
        });
        if (!existing || existing.deletedAt !== null) {
            return res.status(404).json({ error: 'Plan not found' });
        }
        const updated = await db_1.prisma.plan.update({
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
        await (0, logger_1.logAudit)(req.user?.userId || null, 'PLAN_UPDATE', `Updated plan: ${updated.name}`);
        return res.json(updated);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({ error: error.errors[0].message });
        }
        console.error('Update plan error:', error);
        return res.status(500).json({ error: 'Failed to update plan' });
    }
}
async function togglePlanStatus(req, res) {
    try {
        const { status } = req.body;
        if (!['ACTIVE', 'DEACTIVATED', 'ARCHIVED'].includes(status)) {
            return res.status(400).json({ error: 'Invalid plan status value' });
        }
        const plan = await db_1.prisma.plan.findUnique({
            where: { id: req.params.id },
        });
        if (!plan || plan.deletedAt !== null) {
            return res.status(404).json({ error: 'Plan not found' });
        }
        const updated = await db_1.prisma.plan.update({
            where: { id: req.params.id },
            data: { status },
        });
        await (0, logger_1.logAudit)(req.user?.userId || null, 'PLAN_STATUS_CHANGE', `Toggled plan status for ${plan.name} to ${status}`);
        return res.json(updated);
    }
    catch (error) {
        console.error('Toggle plan status error:', error);
        return res.status(500).json({ error: 'Failed to alter plan status' });
    }
}
async function deletePlan(req, res) {
    try {
        const plan = await db_1.prisma.plan.findUnique({
            where: { id: req.params.id },
        });
        if (!plan || plan.deletedAt !== null) {
            return res.status(404).json({ error: 'Plan not found' });
        }
        // Soft delete
        await db_1.prisma.plan.update({
            where: { id: req.params.id },
            data: { deletedAt: new Date(), status: 'ARCHIVED' },
        });
        await (0, logger_1.logAudit)(req.user?.userId || null, 'PLAN_DELETE', `Deleted plan: ${plan.name}`);
        return res.json({ message: 'Plan has been successfully deleted' });
    }
    catch (error) {
        console.error('Delete plan error:', error);
        return res.status(500).json({ error: 'Failed to delete plan' });
    }
}
