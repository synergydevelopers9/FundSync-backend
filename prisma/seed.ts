import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Cleaning existing data (except if already seeded)...');
  
  // Wipe existing tables to ensure clean seed slate
  await prisma.receipt.deleteMany({});
  await prisma.payment.deleteMany({});
  await prisma.subscription.deleteMany({});
  await prisma.supportTicket.deleteMany({});
  await prisma.auditLog.deleteMany({});
  await prisma.notification.deleteMany({});
  await prisma.announcement.deleteMany({});
  await prisma.passwordResetToken.deleteMany({});
  await prisma.member.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.plan.deleteMany({});

  console.log('Seeding Database with Gorgeous Dummy Data...');

  // 1. Create default admin credentials
  const passwordHash = await bcrypt.hash('Apex@12345', 10);
  const adminUser = await prisma.user.create({
    data: {
      email: 'admin@finance.com',
      passwordHash,
      role: 'ADMIN',
      admin: {
        create: {
          username: 'admin',
          name: 'System Admin'
        }
      }
    }
  });
  console.log('Admin account seeded.');

  // 2. Create Plans
  const bronze = await prisma.plan.create({
    data: {
      name: 'Bronze Standard',
      monthlyAmount: 29.00,
      description: 'Access to basic facilities and monthly gym equipment.',
      renewalCycle: 'MONTHLY',
      colorLabel: 'amber',
      benefits: JSON.stringify(['Cardio zone access', 'Locker access', '1 Trainer session/mo'])
    }
  });

  const silver = await prisma.plan.create({
    data: {
      name: 'Silver Premium',
      monthlyAmount: 59.00,
      description: 'Standard plan including group classes and pool access.',
      renewalCycle: 'MONTHLY',
      colorLabel: 'brand',
      benefits: JSON.stringify(['Unlimited gym access', 'All group classes', 'Pool & Spa access', '3 Trainer sessions/mo'])
    }
  });

  const gold = await prisma.plan.create({
    data: {
      name: 'Gold Elite VIP',
      monthlyAmount: 99.00,
      description: 'All-inclusive premium access with personalized coaching.',
      renewalCycle: 'MONTHLY',
      colorLabel: 'emerald',
      benefits: JSON.stringify(['24/7 Access', 'Private locker & laundry', 'Unlimited personal trainer', 'Free supplements bar', 'Guest passes'])
    }
  });
  console.log('Plans seeded successfully.');

  // 3. Helper for date computation relative to today
  const getPastDate = (monthsAgo: number, daysAgo: number = 0) => {
    const d = new Date();
    d.setMonth(d.getMonth() - monthsAgo);
    d.setDate(d.getDate() - daysAgo);
    return d;
  };

  const memberPasswordHash = await bcrypt.hash('memberpassword', 10);

  // 4. Create Members
  const membersData = [
    {
      email: 'jane.cooper@finance.com',
      fullName: 'Jane Cooper',
      mobile: '+1234567890',
      planId: silver.id,
      monthsAgoJoined: 5,
      city: 'San Francisco',
      state: 'California',
      pinCode: '94105',
      amountPaid: 295,
      pendingAmount: 0,
      gender: 'Female',
      dateOfBirth: '1992-04-12',
      profilePhoto: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
    },
    {
      email: 'john.doe@finance.com',
      fullName: 'John Doe',
      mobile: '+1987654321',
      planId: gold.id,
      monthsAgoJoined: 4,
      city: 'New York',
      state: 'New York',
      pinCode: '10001',
      amountPaid: 396,
      pendingAmount: 99, // Overdue
      gender: 'Male',
      dateOfBirth: '1988-11-23',
      profilePhoto: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=150',
    },
    {
      email: 'robert.fox@finance.com',
      fullName: 'Robert Fox',
      mobile: '+14158882312',
      planId: bronze.id,
      monthsAgoJoined: 3,
      city: 'Chicago',
      state: 'Illinois',
      pinCode: '60611',
      amountPaid: 87,
      pendingAmount: 0,
      gender: 'Male',
      dateOfBirth: '1995-07-08',
      profilePhoto: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150',
    },
    {
      email: 'leslie.alexander@finance.com',
      fullName: 'Leslie Alexander',
      mobile: '+16509994545',
      planId: silver.id,
      monthsAgoJoined: 2,
      city: 'Boston',
      state: 'Massachusetts',
      pinCode: '02108',
      amountPaid: 118,
      pendingAmount: 0,
      gender: 'Female',
      dateOfBirth: '1990-09-18',
      profilePhoto: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150',
    },
    {
      email: 'guy.hawkins@finance.com',
      fullName: 'Guy Hawkins',
      mobile: '+12063334411',
      planId: gold.id,
      monthsAgoJoined: 1,
      city: 'Seattle',
      state: 'Washington',
      pinCode: '98101',
      amountPaid: 99,
      pendingAmount: 0,
      gender: 'Male',
      dateOfBirth: '1993-01-30',
      profilePhoto: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150',
    },
    {
      email: 'kristin.watson@finance.com',
      fullName: 'Kristin Watson',
      mobile: '+12147778899',
      planId: bronze.id,
      monthsAgoJoined: 0,
      city: 'Dallas',
      state: 'Texas',
      pinCode: '75201',
      amountPaid: 0,
      pendingAmount: 29.00, // Due
      gender: 'Female',
      dateOfBirth: '1997-05-15',
      profilePhoto: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150',
    }
  ];

  let seq = 1;
  const createdMembers = [];

  for (const m of membersData) {
    const nextDueDate = new Date();
    if (m.pendingAmount > 0) {
      // Overdue/Due dates are set in the past or immediately
      nextDueDate.setDate(nextDueDate.getDate() - 2);
    } else {
      nextDueDate.setDate(nextDueDate.getDate() + (30 - (seq * 3))); // staggered forward due dates
    }

    const user = await prisma.user.create({
      data: {
        email: m.email,
        passwordHash: memberPasswordHash,
        role: 'MEMBER',
        createdAt: getPastDate(m.monthsAgoJoined),
        member: {
          create: {
            memberId: `M${String(seq).padStart(6, '0')}`,
            fullName: m.fullName,
            mobile: m.mobile,
            dateOfBirth: m.dateOfBirth,
            gender: m.gender,
            address: `${seq * 10} Finance Boulevard`,
            city: m.city,
            state: m.state,
            pinCode: m.pinCode,
            profilePhoto: m.profilePhoto,
            planId: m.planId,
            status: 'ACTIVE',
            nextDueDate,
            amountPaid: m.amountPaid,
            pendingAmount: m.pendingAmount,
            createdAt: getPastDate(m.monthsAgoJoined),
          }
        }
      },
      include: {
        member: true
      }
    });
    
    createdMembers.push(user.member!);
    seq++;
  }
  console.log('Members seeded.');

  // 5. Create Payments distributed historically over 6 months
  const paymentsToSeed = [
    // Jane Cooper M000001 (joined 5 months ago, paid 5 times)
    { memberIdx: 0, amount: 59.00, monthsAgo: 5, inv: '100001' },
    { memberIdx: 0, amount: 59.00, monthsAgo: 4, inv: '100002' },
    { memberIdx: 0, amount: 59.00, monthsAgo: 3, inv: '100003' },
    { memberIdx: 0, amount: 59.00, monthsAgo: 2, inv: '100004' },
    { memberIdx: 0, amount: 59.00, monthsAgo: 1, inv: '100005' },

    // John Doe M000002 (joined 4 months ago, paid 4 times)
    { memberIdx: 1, amount: 99.00, monthsAgo: 4, inv: '100006' },
    { memberIdx: 1, amount: 99.00, monthsAgo: 3, inv: '100007' },
    { memberIdx: 1, amount: 99.00, monthsAgo: 2, inv: '100008' },
    { memberIdx: 1, amount: 99.00, monthsAgo: 1, inv: '100009' },

    // Robert Fox M000003 (joined 3 months ago, paid 3 times)
    { memberIdx: 2, amount: 29.00, monthsAgo: 3, inv: '100010' },
    { memberIdx: 2, amount: 29.00, monthsAgo: 2, inv: '100011' },
    { memberIdx: 2, amount: 29.00, monthsAgo: 1, inv: '100012' },

    // Leslie Alexander M000004 (joined 2 months ago, paid 2 times)
    { memberIdx: 3, amount: 59.00, monthsAgo: 2, inv: '100013' },
    { memberIdx: 3, amount: 59.00, monthsAgo: 1, inv: '100014' },

    // Guy Hawkins M000005 (joined 1 month ago, paid 1 time)
    { memberIdx: 4, amount: 99.00, monthsAgo: 1, inv: '100015' }
  ];

  for (const pay of paymentsToSeed) {
    const targetMember = createdMembers[pay.memberIdx];
    const transId = `TXN-${Math.floor(100000 + Math.random() * 900000)}`;
    const payDate = getPastDate(pay.monthsAgo, Math.floor(Math.random() * 15) + 1);

    await prisma.payment.create({
      data: {
        memberId: targetMember.id,
        amount: pay.amount,
        date: payDate,
        transactionId: transId,
        paymentMethod: 'MOCK',
        status: 'SUCCESS',
        invoiceNumber: `INV-${pay.inv}`,
        receiptUrl: `/receipts/receipt-${pay.inv}.pdf`,
        createdAt: payDate,
      }
    });
  }
  console.log('Historical payment records seeded.');

  // 6. Create Support Tickets
  await prisma.supportTicket.create({
    data: {
      memberId: createdMembers[0].id, // Jane Cooper
      subject: 'Inquiry regarding credit card auto-payments',
      description: 'I would like to know if auto-debit can be scheduled on the 10th of every month instead of 5th. Thank you.',
      status: 'OPEN',
      priority: 'LOW',
    }
  });

  await prisma.supportTicket.create({
    data: {
      memberId: createdMembers[1].id, // John Doe
      subject: 'Urgent: Double debited on Gold Subscription',
      description: 'My card transaction failed at first try but the amount has been debited twice. Please look into this immediately.',
      status: 'IN_PROGRESS',
      priority: 'HIGH',
    }
  });

  await prisma.supportTicket.create({
    data: {
      memberId: createdMembers[2].id, // Robert Fox
      subject: 'Requesting plan downgrade details',
      description: 'Could you explain if plan benefits change immediately or at the end of the billing cycle when I switch from silver to bronze?',
      status: 'RESOLVED',
      priority: 'MEDIUM',
    }
  });
  console.log('Support tickets seeded.');

  // 7. Seed Announcements
  await prisma.announcement.create({
    data: {
      title: 'Facility Maintenance Schedule',
      content: 'Please note that the main gym area will be closed for quarterly maintenance on Sunday, July 12th from 6:00 AM to 2:00 PM.',
      targetRole: 'ALL',
      isPinned: true,
    }
  });

  await prisma.announcement.create({
    data: {
      title: 'New Personal Trainer Onboarding',
      content: 'We are thrilled to welcome Coach Marcus to our Elite trainers squad. Book your free Gold Tier demo sessions from the settings desk today!',
      targetRole: 'MEMBER',
      isPinned: false,
    }
  });
  console.log('Announcements seeded.');

  // 8. Seed Audit Logs
  await prisma.auditLog.create({
    data: {
      action: 'SYSTEM_BOOTSTRAP',
      details: 'Initial database seeds completed by standard seeding script.',
      ipAddress: '127.0.0.1'
    }
  });

  await prisma.auditLog.create({
    data: {
      userId: adminUser.id,
      action: 'PLANS_SYNC',
      details: 'Successfully created standard membership tiers: Bronze, Silver, Gold.',
      ipAddress: '127.0.0.1'
    }
  });

  console.log('Database seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
