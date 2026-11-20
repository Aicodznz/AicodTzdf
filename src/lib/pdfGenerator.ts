import { jsPDF } from 'jspdf';
import type { BusinessAccount, GasOrder, Invoice, Language } from '../types/oilcom';

function drawOilcomPdfHeader(
  doc: jsPDF,
  subtitle: string,
  height = 94
): void {
  // Official OILCOM Blue Header
  doc.setFillColor(11, 42, 111);
  doc.rect(0, 0, 595, height, 'F');

  // Tri-color OILCOM Top Accent Stripe (Blue / Red / Yellow)
  doc.setFillColor(37, 99, 235);
  doc.rect(0, 0, 198, 5, 'F');
  doc.setFillColor(217, 32, 39);
  doc.rect(198, 0, 199, 5, 'F');
  doc.setFillColor(245, 184, 0);
  doc.rect(397, 0, 198, 5, 'F');

  doc.setTextColor(245, 184, 0);
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.text('OILCOM SUPER APP', 40, 44);

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(subtitle, 40, 68);
}

export function downloadOrderReceiptPdf(
  order: Pick<
    GasOrder,
    | 'orderNumber'
    | 'customerName'
    | 'customerPhone'
    | 'fulfillmentType'
    | 'orderKind'
    | 'deliveryAddress'
    | 'itemsSummary'
    | 'totalTzs'
    | 'paymentMethod'
    | 'paymentStatus'
    | 'status'
    | 'voucherCode'
    | 'discountTzs'
  >,
  lang: Language = 'sw'
): void {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });

  drawOilcomPdfHeader(
    doc,
    lang === 'sw'
      ? 'Risiti Rasmi ya Oda — Huduma Zote za Oilcom, Sehemu Moja'
      : 'Official Order Receipt — OILCOM Energy & LPG Ecosystem',
    92
  );

  doc.setTextColor(11, 42, 111);
  doc.setFontSize(15);
  doc.setFont('helvetica', 'bold');
  doc.text(`RECEIPT / RISITI: ${order.orderNumber}`, 40, 132);

  doc.setTextColor(30, 41, 59);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Customer: ${order.customerName}`, 40, 154);
  doc.text(`Phone: ${order.customerPhone || '-'}`, 40, 170);
  doc.text(
    `Fulfillment: ${order.fulfillmentType.toUpperCase()} (${order.orderKind.toUpperCase()})`,
    40,
    186
  );
  doc.text(`Address / Station: ${order.deliveryAddress}`, 40, 202);
  doc.text(
    `Payment: ${order.paymentMethod.replace(/_/g, ' ').toUpperCase()} · ${order.paymentStatus.toUpperCase()}`,
    40,
    218
  );
  doc.text(`Order Status: ${order.status.toUpperCase()}`, 40, 234);

  doc.setDrawColor(215, 223, 235);
  doc.line(40, 254, 555, 254);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(11, 42, 111);
  doc.text('Items / Bidhaa', 40, 276);
  doc.text('Amount (TZS)', 440, 276);
  doc.line(40, 286, 555, 286);

  const discount = Math.max(0, Number(order.discountTzs) || 0);
  const subtotal = order.totalTzs + discount;

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(30, 41, 59);
  doc.text(order.itemsSummary, 40, 310, { maxWidth: 380 });
  doc.text(`TZS ${subtotal.toLocaleString('en-US')}`, 440, 310);

  let nextY = 344;
  if (discount > 0) {
    doc.setTextColor(217, 32, 39);
    doc.text(
      `Rewards Voucher Discount${order.voucherCode ? ` (${order.voucherCode})` : ''}`,
      40,
      nextY
    );
    doc.text(`- TZS ${discount.toLocaleString('en-US')}`, 440, nextY);
    nextY += 24;
  }

  doc.setDrawColor(215, 223, 235);
  doc.line(40, nextY, 555, nextY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(11, 42, 111);
  doc.text('TOTAL PAID / JUMLA', 40, nextY + 24);
  doc.text(`TZS ${order.totalTzs.toLocaleString('en-US')}`, 440, nextY + 24);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(
    'OILCOM SUPER APP Sandbox Receipt. Keep this receipt for loyalty verification & support.',
    40,
    780
  );

  doc.save(`OILCOM-Receipt-${order.orderNumber}.pdf`);
}

export function downloadInvoicePdf(
  invoice: Invoice,
  business?: BusinessAccount | null
): void {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });

  drawOilcomPdfHeader(
    doc,
    'Huduma Zote za Oilcom, Sehemu Moja — Corporate B2B Invoice',
    96
  );

  doc.setTextColor(11, 42, 111);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(`TAX INVOICE: ${invoice.invoiceNumber}`, 40, 136);

  doc.setTextColor(30, 41, 59);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Order Reference: ${invoice.orderId}`, 40, 158);
  doc.text(`Due Date: ${invoice.dueDate}`, 40, 174);
  doc.text(`Status: ${invoice.status.toUpperCase()}`, 40, 190);

  if (business) {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(11, 42, 111);
    doc.text('Billed To:', 340, 136);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(30, 41, 59);
    doc.text(business.companyName, 340, 154);
    doc.text(`TIN: ${business.tinNumber}`, 340, 170);
    doc.text(business.contactEmail, 340, 186);
    doc.text(business.contactPhone, 340, 202);
  }

  doc.setDrawColor(215, 223, 235);
  doc.line(40, 224, 555, 224);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(11, 42, 111);
  doc.text('Description', 40, 248);
  doc.text('Amount (TZS)', 440, 248);
  doc.line(40, 258, 555, 258);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(30, 41, 59);
  doc.text(`Bulk Fuel / Lubricant Supply (Order ${invoice.orderId})`, 40, 282);
  doc.text(`TZS ${invoice.amountTzs.toLocaleString('en-US')}`, 440, 282);

  doc.text('Applicable VAT (18% Configurable Placeholder)', 40, 306);
  doc.text(`TZS ${invoice.taxTzs.toLocaleString('en-US')}`, 440, 306);

  doc.line(40, 326, 555, 326);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(11, 42, 111);
  doc.text('TOTAL DUE', 40, 350);
  doc.text(`TZS ${invoice.totalTzs.toLocaleString('en-US')}`, 440, 350);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(
    'Generated by OILCOM SUPER APP B2B Portal. Figures use configurable platform tax/price settings.',
    40,
    780
  );

  doc.save(`${invoice.invoiceNumber}.pdf`);
}

export function downloadBusinessStatementPdf(
  business: BusinessAccount,
  invoices: Invoice[]
): void {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  drawOilcomPdfHeader(
    doc,
    `${business.companyName} · TIN ${business.tinNumber} — Corporate Account Statement`,
    86
  );

  doc.setTextColor(30, 41, 59);
  doc.setFontSize(10);
  doc.text(
    `Credit Limit: TZS ${business.creditLimitTzs.toLocaleString('en-US')}   |   Credit Used: TZS ${business.creditUsedTzs.toLocaleString('en-US')}   |   Terms: Net ${business.paymentTermsDays} Days`,
    40,
    116
  );

  let y = 148;
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(11, 42, 111);
  doc.text('Invoice #', 40, y);
  doc.text('Due Date', 200, y);
  doc.text('Status', 320, y);
  doc.text('Total (TZS)', 440, y);
  y += 10;
  doc.line(40, y, 555, y);
  y += 18;

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(30, 41, 59);
  invoices.forEach((inv) => {
    if (y > 750) {
      doc.addPage();
      y = 50;
    }
    doc.text(inv.invoiceNumber, 40, y);
    doc.text(inv.dueDate, 200, y);
    doc.text(inv.status.toUpperCase(), 320, y);
    doc.text(inv.totalTzs.toLocaleString('en-US'), 440, y);
    y += 20;
  });

  doc.save(`OILCOM-Statement-${business.tinNumber}.pdf`);
}
