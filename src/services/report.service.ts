import ExcelJS from 'exceljs';
import fs from 'fs';
import path from 'path';

export async function generateMembersReportExcel(members: any[]): Promise<string> {
  const publicDir = path.join(__dirname, '../../public/reports');
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  const fileName = `members-report-${Date.now()}.xlsx`;
  const filePath = path.join(publicDir, fileName);
  const relativePath = `/reports/${fileName}`;

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Members');

  worksheet.columns = [
    { header: 'Member ID', key: 'memberId', width: 15 },
    { header: 'Full Name', key: 'fullName', width: 25 },
    { header: 'Email', key: 'email', width: 30 },
    { header: 'Mobile', key: 'mobile', width: 15 },
    { header: 'Gender', key: 'gender', width: 12 },
    { header: 'City', key: 'city', width: 15 },
    { header: 'Status', key: 'status', width: 12 },
    { header: 'Join Date', key: 'joinDate', width: 20 },
  ];

  // Apply visual styling to header row
  const headerRow = worksheet.getRow(1);
  headerRow.font = { name: 'Arial', family: 4, size: 11, bold: true, color: { argb: 'FFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: '7C3AED' } // brand violet
  };

  members.forEach((m) => {
    worksheet.addRow({
      memberId: m.memberId,
      fullName: m.fullName,
      email: m.user.email,
      mobile: m.mobile,
      gender: m.gender,
      city: m.city,
      status: m.status,
      joinDate: new Date(m.createdAt).toLocaleDateString(),
    });
  });

  await workbook.xlsx.writeFile(filePath);
  return relativePath;
}

export async function generateRevenueReportExcel(payments: any[]): Promise<string> {
  const publicDir = path.join(__dirname, '../../public/reports');
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  const fileName = `revenue-report-${Date.now()}.xlsx`;
  const filePath = path.join(publicDir, fileName);
  const relativePath = `/reports/${fileName}`;

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Payments');

  worksheet.columns = [
    { header: 'Transaction ID', key: 'transactionId', width: 25 },
    { header: 'Invoice Number', key: 'invoiceNumber', width: 20 },
    { header: 'Member ID', key: 'memberId', width: 15 },
    { header: 'Member Name', key: 'memberName', width: 25 },
    { header: 'Amount ($)', key: 'amount', width: 15 },
    { header: 'Payment Method', key: 'paymentMethod', width: 15 },
    { header: 'Status', key: 'status', width: 12 },
    { header: 'Date & Time', key: 'date', width: 20 },
  ];

  const headerRow = worksheet.getRow(1);
  headerRow.font = { name: 'Arial', family: 4, size: 11, bold: true, color: { argb: 'FFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: '7C3AED' }
  };

  payments.forEach((p) => {
    worksheet.addRow({
      transactionId: p.transactionId,
      invoiceNumber: `INV-${p.invoiceNumber}`,
      memberId: p.member.memberId,
      memberName: p.member.fullName,
      amount: p.amount,
      paymentMethod: p.paymentMethod,
      status: p.status,
      date: new Date(p.date).toLocaleString(),
    });
  });

  // Calculate sum of payments dynamically
  const nextRowIndex = payments.length + 3;
  worksheet.getCell(`D${nextRowIndex}`).value = 'Total Revenue';
  worksheet.getCell(`D${nextRowIndex}`).font = { bold: true };
  worksheet.getCell(`E${nextRowIndex}`).value = {
    formula: `SUM(E2:E${payments.length + 1})`,
    date1904: false
  };
  worksheet.getCell(`E${nextRowIndex}`).font = { bold: true };

  await workbook.xlsx.writeFile(filePath);
  return relativePath;
}

export function generateCSVContent(headers: string[], rows: any[][]): string {
  const headerLine = headers.map(h => `"${h.replace(/"/g, '""')}"`).join(',');
  const rowLines = rows.map(r => 
    r.map(val => {
      const stringVal = val === null || val === undefined ? '' : String(val);
      return `"${stringVal.replace(/"/g, '""')}"`;
    }).join(',')
  );
  return [headerLine, ...rowLines].join('\n');
}
