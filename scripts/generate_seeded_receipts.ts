import { PrismaClient } from '@prisma/client';
import { generateReceiptPDF } from '../src/services/receipt.service';

const prisma = new PrismaClient();

async function main() {
  console.log('Generating PDF receipt files for pre-seeded payments...');
  const payments = await prisma.payment.findMany({
    where: { status: 'SUCCESS' },
    include: {
      member: {
        include: {
          user: true,
          plan: true,
        }
      }
    }
  });

  for (const payment of payments) {
    const member = payment.member;
    
    console.log(`Generating receipt for ${payment.invoiceNumber} (${member.fullName})...`);
    
    const receiptPath = await generateReceiptPDF({
      invoiceNumber: payment.invoiceNumber,
      memberId: member.memberId,
      memberName: member.fullName,
      memberEmail: member.user.email,
      memberMobile: member.mobile,
      planName: member.plan?.name || 'Standard Membership',
      amount: payment.amount,
      date: payment.date,
      transactionId: payment.transactionId,
      paymentMethod: payment.paymentMethod,
    });

    // Update the database record with the generated path
    await prisma.payment.update({
      where: { id: payment.id },
      data: { receiptUrl: receiptPath }
    });

    // Also check if a Receipt record exists, if not, create it
    const receiptExists = await prisma.receipt.findUnique({
      where: { paymentId: payment.id }
    });

    if (!receiptExists) {
      const receiptNumber = `REC-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
      await prisma.receipt.create({
        data: {
          paymentId: payment.id,
          receiptNumber,
          pdfPath: receiptPath,
        }
      });
    }
  }

  console.log('Done! All seeded payments now have active downloadable receipts.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
