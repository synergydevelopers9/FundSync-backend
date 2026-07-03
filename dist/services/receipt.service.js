"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateReceiptPDF = generateReceiptPDF;
const pdfkit_1 = __importDefault(require("pdfkit"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
async function generateReceiptPDF(data) {
    return new Promise((resolve, reject) => {
        try {
            const publicDir = path_1.default.join(__dirname, '../../public/receipts');
            if (!fs_1.default.existsSync(publicDir)) {
                fs_1.default.mkdirSync(publicDir, { recursive: true });
            }
            const fileName = `receipt-${data.invoiceNumber}.pdf`;
            const filePath = path_1.default.join(publicDir, fileName);
            const relativePath = `/receipts/${fileName}`;
            const doc = new pdfkit_1.default({ size: 'A4', margin: 40 });
            const writeStream = fs_1.default.createWriteStream(filePath);
            doc.pipe(writeStream);
            // Colors
            const primaryColor = '#7c3aed'; // Violet
            const darkColor = '#0f172a'; // Slate-900
            const mutedColor = '#64748b'; // Slate-500
            const lightBg = '#f8fafc'; // Slate-50
            // 1. Header (Brand Logo & Meta details)
            doc.rect(0, 0, 595.28, 12).fill(primaryColor); // Top accent border
            doc.fillColor(primaryColor)
                .font('Helvetica-Bold')
                .fontSize(22)
                .text('ApexFinance', 40, 40);
            doc.fillColor(mutedColor)
                .font('Helvetica')
                .fontSize(9)
                .text('Enterprise Billing & Member Management', 40, 65)
                .text('100 Vercel Way, Suite 400', 40, 78)
                .text('support@apexfinance.io', 40, 91);
            doc.fillColor(darkColor)
                .font('Helvetica-Bold')
                .fontSize(18)
                .text('PAYMENT RECEIPT', 380, 40, { align: 'right' });
            doc.fillColor(mutedColor)
                .font('Helvetica')
                .fontSize(9)
                .text(`Receipt No: REC-${data.invoiceNumber}`, 380, 65, { align: 'right' })
                .text(`Date: ${data.date.toLocaleDateString()}`, 380, 78, { align: 'right' })
                .text(`Status: PAID`, 380, 91, { align: 'right' });
            // Horizontal separator line
            doc.moveTo(40, 115).lineTo(555, 115).strokeColor('#cbd5e1').lineWidth(1).stroke();
            // 2. Billing Grid (From / To metadata)
            doc.fillColor(primaryColor)
                .font('Helvetica-Bold')
                .fontSize(10)
                .text('BILLED TO:', 40, 135);
            doc.fillColor(darkColor)
                .font('Helvetica-Bold')
                .fontSize(11)
                .text(data.memberName, 40, 150);
            doc.fillColor(mutedColor)
                .font('Helvetica')
                .fontSize(9)
                .text(`ID: ${data.memberId}`, 40, 165)
                .text(`Email: ${data.memberEmail}`, 40, 178)
                .text(`Mobile: ${data.memberMobile}`, 40, 191);
            doc.fillColor(primaryColor)
                .font('Helvetica-Bold')
                .fontSize(10)
                .text('PAYMENT DETAILS:', 350, 135);
            doc.fillColor(darkColor)
                .font('Helvetica')
                .fontSize(9)
                .text(`Transaction ID: ${data.transactionId}`, 350, 150)
                .text(`Payment Method: ${data.paymentMethod}`, 350, 163)
                .text(`Invoice No: INV-${data.invoiceNumber}`, 350, 176)
                .text(`Currency: USD ($)`, 350, 189);
            // Horizontal separator line
            doc.moveTo(40, 215).lineTo(555, 215).strokeColor('#cbd5e1').lineWidth(1).stroke();
            // 3. Table Header
            const tableTop = 235;
            doc.rect(40, tableTop, 515, 25).fill(lightBg);
            doc.fillColor(darkColor)
                .font('Helvetica-Bold')
                .fontSize(9)
                .text('PLAN DESCRIPTION', 50, tableTop + 8)
                .text('QTY', 300, tableTop + 8, { width: 30, align: 'center' })
                .text('TAX RATE (GST)', 350, tableTop + 8, { width: 90, align: 'center' })
                .text('SUBTOTAL', 470, tableTop + 8, { width: 80, align: 'right' });
            // Table Row
            const rowTop = tableTop + 35;
            doc.fillColor(darkColor)
                .font('Helvetica')
                .fontSize(10)
                .text(`${data.planName} Membership Subscription`, 50, rowTop)
                .text('1', 300, rowTop, { width: 30, align: 'center' })
                .text('18.00% (Inc.)', 350, rowTop, { width: 90, align: 'center' })
                .text(`$${data.amount.toFixed(2)}`, 470, rowTop, { width: 80, align: 'right' });
            // Divider below item
            doc.moveTo(40, rowTop + 20).lineTo(555, rowTop + 20).strokeColor('#e2e8f0').lineWidth(0.5).stroke();
            // 4. Totals Calculation
            const totalsTop = rowTop + 40;
            const taxAmount = data.amount * 0.18 / 1.18; // Included GST
            const subtotal = data.amount - taxAmount;
            doc.fillColor(mutedColor)
                .font('Helvetica')
                .fontSize(9)
                .text('Subtotal (Excl. Tax)', 320, totalsTop, { width: 120, align: 'right' })
                .text(`$${subtotal.toFixed(2)}`, 470, totalsTop, { width: 80, align: 'right' });
            doc.text('GST (18% Included)', 320, totalsTop + 15, { width: 120, align: 'right' })
                .text(`$${taxAmount.toFixed(2)}`, 470, totalsTop + 15, { width: 80, align: 'right' });
            doc.moveTo(350, totalsTop + 32).lineTo(555, totalsTop + 32).strokeColor('#e2e8f0').lineWidth(0.5).stroke();
            doc.fillColor(darkColor)
                .font('Helvetica-Bold')
                .fontSize(12)
                .text('Total Amount Paid', 320, totalsTop + 40, { width: 120, align: 'right' })
                .text(`$${data.amount.toFixed(2)}`, 470, totalsTop + 40, { width: 80, align: 'right' });
            // 5. Bottom Section: QR Code Box and Digital Signature
            const footerTop = totalsTop + 110;
            // Draw a simulated QR Code using vector boxes
            doc.fillColor(darkColor);
            doc.rect(40, footerTop, 70, 70).strokeColor('#cbd5e1').lineWidth(1).stroke();
            // Draw standard inner QR code corner boxes
            doc.rect(45, footerTop + 5, 20, 20).fill('#0f172a');
            doc.rect(48, footerTop + 8, 14, 14).fill('#ffffff');
            doc.rect(51, footerTop + 11, 8, 8).fill('#0f172a');
            doc.rect(85, footerTop + 5, 20, 20).fill('#0f172a');
            doc.rect(88, footerTop + 8, 14, 14).fill('#ffffff');
            doc.rect(91, footerTop + 11, 8, 8).fill('#0f172a');
            doc.rect(45, footerTop + 45, 20, 20).fill('#0f172a');
            doc.rect(48, footerTop + 48, 14, 14).fill('#ffffff');
            doc.rect(51, footerTop + 51, 8, 8).fill('#0f172a');
            // Draw some random smaller blocks to mimic QR pixel layout
            doc.rect(72, footerTop + 10, 5, 5).fill('#0f172a');
            doc.rect(78, footerTop + 22, 5, 10).fill('#0f172a');
            doc.rect(85, footerTop + 35, 10, 5).fill('#0f172a');
            doc.rect(70, footerTop + 45, 8, 8).fill('#0f172a');
            doc.rect(82, footerTop + 55, 15, 5).fill('#0f172a');
            doc.rect(95, footerTop + 48, 5, 12).fill('#0f172a');
            doc.fillColor(mutedColor)
                .font('Helvetica')
                .fontSize(7)
                .text('Scan for receipt validation', 40, footerTop + 75, { width: 80, align: 'center' });
            // Draw Authorized Signature Line
            doc.moveTo(380, footerTop + 50).lineTo(520, footerTop + 50).strokeColor('#94a3b8').lineWidth(1).stroke();
            // Draw signature font / vector style representation
            doc.fillColor(primaryColor)
                .font('Courier-Oblique')
                .fontSize(14)
                .text('ApexFinance Billing', 385, footerTop + 32, { width: 130, align: 'center' });
            doc.fillColor(darkColor)
                .font('Helvetica-Bold')
                .fontSize(8)
                .text('AUTHORIZED SIGNATURE', 380, footerTop + 56, { width: 140, align: 'center' });
            // 6. Footer Disclaimer
            const bottomY = footerTop + 110;
            doc.moveTo(40, bottomY).lineTo(555, bottomY).strokeColor('#e2e8f0').lineWidth(0.5).stroke();
            doc.fillColor(mutedColor)
                .font('Helvetica')
                .fontSize(8)
                .text('Thank you for your payment! The subscription is active for 30 days starting from the date of billing.', 40, bottomY + 12, { align: 'center', width: 515 })
                .text('If you have any questions or require support, please contact us at support@apexfinance.io', 40, bottomY + 22, { align: 'center', width: 515 });
            doc.end();
            writeStream.on('finish', () => {
                resolve(relativePath);
            });
            writeStream.on('error', (err) => {
                reject(err);
            });
        }
        catch (error) {
            reject(error);
        }
    });
}
