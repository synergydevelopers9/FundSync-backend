import { Response } from 'express';
import { z } from 'zod';
import { prisma } from '../utils/db';
import { AuthRequest } from '../middleware/auth.middleware';
import { logAudit } from '../utils/logger';
import { createNotification } from '../utils/notifications';
import { generateReceiptPDF } from '../services/receipt.service';

const createOrderSchema = z.object({
  planId: z.string().min(1, 'Plan ID is required'),
  paymentMethod: z.enum(['UPI', 'CARD', 'NET_BANKING', 'MOCK']),
});

const confirmPaymentSchema = z.object({
  paymentId: z.string().min(1, 'Payment ID is required'),
  status: z.enum(['SUCCESS', 'FAILED']),
  gatewayTxnId: z.string().optional(),
});

export async function createOrder(req: AuthRequest, res: Response) {
  try {
    const memberId = req.user?.memberId;
    if (!memberId) {
      return res.status(400).json({ error: 'Invalid member session' });
    }

    const validated = createOrderSchema.parse(req.body);

    const member = await prisma.member.findUnique({
      where: { id: memberId },
      include: { plan: true },
    });

    if (!member || member.deletedAt !== null) {
      return res.status(404).json({ error: 'Member profile not found' });
    }

    // Determine payment amount
    const plan = await prisma.plan.findUnique({
      where: { id: validated.planId },
    });
    if (!plan || plan.deletedAt !== null) {
      return res.status(404).json({ error: 'Selected subscription plan not found' });
    }

    const amount = plan.monthlyAmount;
    const transactionId = `TXN-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const invoiceNumber = `INV-${Date.now()}-${Math.floor(10 + Math.random() * 90)}`;

    const payment = await prisma.payment.create({
      data: {
        memberId,
        amount,
        transactionId,
        paymentMethod: validated.paymentMethod,
        invoiceNumber,
        status: 'PENDING',
      },
    });

    await logAudit(req.user?.userId || null, 'PAYMENT_ORDER_CREATE', `Created payment order for plan: ${plan.name}`);

    return res.status(201).json({
      message: 'Order created',
      payment,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('Create payment order error:', error);
    return res.status(500).json({ error: 'Failed to initialize payment order' });
  }
}

export async function confirmPayment(req: AuthRequest, res: Response) {
  try {
    const validated = confirmPaymentSchema.parse(req.body);

    const payment = await prisma.payment.findUnique({
      where: { id: validated.paymentId },
      include: { member: { include: { user: true, plan: true } } },
    });

    if (!payment || payment.deletedAt !== null) {
      return res.status(404).json({ error: 'Payment record not found' });
    }

    if (payment.status !== 'PENDING') {
      return res.status(400).json({ error: 'Payment is already processed' });
    }

    const finalStatus = validated.status;
    const finalTxnId = validated.gatewayTxnId || payment.transactionId;

    if (finalStatus === 'SUCCESS') {
      // Calculate dues updates and next date
      const member = payment.member;
      const amountPaid = member.amountPaid + payment.amount;
      
      // Calculate next due date (extend 30 days from current due date, or from today if overdue/null)
      const currentDue = member.nextDueDate ? new Date(member.nextDueDate) : new Date();
      const baseDate = currentDue > new Date() ? currentDue : new Date();
      const nextDue = new Date(baseDate.getTime() + 30 * 24 * 60 * 60 * 1000);

      // Generate receipt
      const receiptPath = await generateReceiptPDF({
        invoiceNumber: payment.invoiceNumber,
        memberId: member.memberId,
        memberName: member.fullName,
        memberEmail: member.user.email,
        memberMobile: member.mobile,
        planName: member.plan?.name || 'Standard Membership',
        amount: payment.amount,
        date: new Date(),
        transactionId: finalTxnId,
        paymentMethod: payment.paymentMethod,
      });

      // Update database inside transaction
      const receiptNumber = `REC-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

      await prisma.$transaction([
        prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: 'SUCCESS',
            transactionId: finalTxnId,
            receiptUrl: receiptPath,
          },
        }),
        prisma.member.update({
          where: { id: member.id },
          data: {
            amountPaid,
            pendingAmount: 0,
            nextDueDate: nextDue,
            status: 'ACTIVE',
          },
        }),
        prisma.receipt.create({
          data: {
            paymentId: payment.id,
            receiptNumber,
            pdfPath: receiptPath,
          },
        }),
      ]);

      await logAudit(
        member.userId,
        'PAYMENT_SUCCESS',
        `Successfully paid $${payment.amount} via ${payment.paymentMethod}. Next due: ${nextDue.toLocaleDateString()}`
      );

      await createNotification(
        member.userId,
        'Payment Successful!',
        `Thank you! We received your payment of $${payment.amount}. Receipt REC-${receiptNumber} is ready for download.`,
        'PAYMENT'
      );

      // Notify Admins
      const admins = await prisma.user.findMany({ where: { role: 'ADMIN', deletedAt: null } });
      for (const admin of admins) {
        await createNotification(
          admin.id,
          `Payment Received`,
          `Member ${member.memberId} paid $${payment.amount} via ${payment.paymentMethod}.`,
          'PAYMENT'
        );
      }

      return res.json({
        message: 'Payment confirmed successfully',
        status: 'SUCCESS',
        receiptUrl: receiptPath,
      });
    } else {
      // Payment Failed
      await prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'FAILED' },
      });

      await logAudit(
        payment.member.userId,
        'PAYMENT_FAILED',
        `Payment failed for invoice INV-${payment.invoiceNumber}`
      );

      await createNotification(
        payment.member.userId,
        'Payment Failed',
        `Your payment order of $${payment.amount} failed. Please try again.`,
        'PAYMENT'
      );

      return res.json({
        message: 'Payment marked as failed',
        status: 'FAILED',
      });
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('Confirm payment error:', error);
    return res.status(500).json({ error: 'Failed to update payment status' });
  }
}

// Global payment listings (restricted role based inside router)
export async function getPaymentsHistory(req: AuthRequest, res: Response) {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    const where: any = { deletedAt: null };

    // If client role is member, force limit to only their payments
    if (req.user?.role === 'MEMBER') {
      where.memberId = req.user.memberId;
    }

    const [payments, total] = await prisma.$transaction([
      prisma.payment.findMany({
        where,
        include: {
          member: { select: { memberId: true, fullName: true } },
        },
        orderBy: { date: 'desc' },
        skip,
        take: limit,
      }),
      prisma.payment.count({ where }),
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
  } catch (error) {
    console.error('Get history error:', error);
    return res.status(500).json({ error: 'Failed to retrieve payments history' });
  }
}
