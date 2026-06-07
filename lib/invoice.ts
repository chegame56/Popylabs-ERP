import jsPDF from "jspdf";
import { Organization, Transaction } from "./types";
import { amountInWords, formatLKR } from "./utils";

/**
 * Dual-mode Professional PDF + Thermal generator (Popylabs ERP POS).
 *
 * - Controlled by Organization.issuesTaxInvoices (default false = Normal Receipt mode).
 * - Normal Receipt (default for most shops): clean modern PDF + narrow thermal. No VAT/TIN/tax claims.
 * - Tax Invoice mode (only when issuesTaxInvoices=true for VAT-registered businesses): full IRD-style TAX INVOICE with TIN, VAT breakdown per line + summary, amount in words, legal text.
 * - Both modes keep high-quality layout, logo-ready (text for now), payment method, customer info (for orders), WhatsApp text support.
 * - Rendering uses current org setting (reprints reflect current registration status).
 */

// Reconstruct / normalize a transaction for rendering (supports legacy txns)
function normalizeTxn(txn: any): {
  invoiceNumber: string;
  createdAt: Date;
  type: "sale" | "order";
  items: Array<{ name: string; qty: number; price: number }>;
  subtotal: number;
  discount: number;
  vatRate: number;
  vatAmount: number;
  taxableValue: number;
  grandTotal: number;
  paymentMethod: string;
  customerName?: string;
  customerPhone?: string;
  placeOfSupply?: string;
} {
  const createdAt = txn.createdAt?.toDate ? txn.createdAt.toDate() : (txn.createdAt ? new Date(txn.createdAt) : new Date());

  // Legacy fallback: if no vat fields, treat old "total" as grandTotal and back-calculate assuming default 18%
  const hasVatFields = typeof txn.vatRate === "number" && typeof txn.vatAmount === "number" && typeof txn.taxableValue === "number";

  const subtotal = Number(txn.subtotal ?? 0);
  const discount = Number(txn.discount ?? 0);
  let vatRate = Number(txn.vatRate ?? 18);
  let taxableValue = Number(txn.taxableValue ?? Math.max(0, subtotal - discount));
  let vatAmount = Number(txn.vatAmount ?? 0);
  let grandTotal = Number(txn.grandTotal ?? txn.total ?? subtotal - discount);

  if (!hasVatFields) {
    // Legacy txn — recompute with 18% for display (best effort)
    taxableValue = Math.max(0, subtotal - discount);
    vatAmount = Math.round(taxableValue * (vatRate / 100));
    grandTotal = taxableValue + vatAmount;
  }

  return {
    invoiceNumber: txn.invoiceNumber || "INV-XXXX",
    createdAt,
    type: txn.type || "sale",
    items: (txn.items || []).map((i: any) => ({
      name: i.name || "Item",
      qty: Number(i.qty || 0),
      price: Number(i.price || 0),
    })),
    subtotal,
    discount,
    vatRate,
    vatAmount,
    taxableValue,
    grandTotal,
    paymentMethod: txn.paymentMethod || "Cash",
    customerName: txn.customerName,
    customerPhone: txn.customerPhone,
    placeOfSupply: txn.placeOfSupply,
  };
}

export interface InvoiceRenderData {
  org: Organization;
  txn: ReturnType<typeof normalizeTxn>;
}

/* =========================================================
   1. PROFESSIONAL PDF (jsPDF) — branches on org.issuesTaxInvoices
   ========================================================= */

export function generateProfessionalPDF(rawOrg: Organization, rawTxn: any): void {
  const isTax = !!(rawOrg && (rawOrg as any).issuesTaxInvoices === true);
  const { org, txn } = prepareRenderData(rawOrg, rawTxn);

  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth(); // ~210mm A4
  let y = 15;

  if (isTax) {
    // ========== FULL TAX INVOICE MODE (VAT-registered businesses only) ==========
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text("TAX INVOICE", pageWidth / 2, y, { align: "center" });
    y += 10;

    // Seller block (left)
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text(org.legalName || "YOUR BUSINESS NAME", 20, y);
    y += 6;

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    if (org.address) {
      const addrLines = doc.splitTextToSize(org.address, 95);
      doc.text(addrLines, 20, y);
      y += addrLines.length * 5;
    }
    if (org.contactPhone) {
      doc.text(`Tel: ${org.contactPhone}`, 20, y);
      y += 5;
    }
    if (org.tin) {
      doc.text(`TIN: ${org.tin}`, 20, y);
      y += 6;
    }

    // Right side meta
    let rightY = 28;
    doc.setFontSize(10);
    doc.text(`Invoice No: ${txn.invoiceNumber}`, 115, rightY);
    rightY += 6;
    doc.text(`Date: ${txn.createdAt.toLocaleDateString("en-LK")} ${txn.createdAt.toLocaleTimeString("en-LK", { hour: "2-digit", minute: "2-digit" })}`, 115, rightY);
    rightY += 6;
    doc.text(`Payment: ${txn.paymentMethod}`, 115, rightY);
    rightY += 6;

    const place = txn.placeOfSupply || org.address || "Sri Lanka";
    doc.text(`Place of Supply: ${place}`, 115, rightY);

    y = Math.max(y, rightY) + 8;

    // Customer / Bill To (if present)
    if (txn.customerName || txn.customerPhone) {
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text("Bill To:", 20, y);
      y += 5;
      doc.setFont("helvetica", "normal");
      if (txn.customerName) {
        doc.text(txn.customerName, 20, y);
        y += 5;
      }
      if (txn.customerPhone) {
        doc.text(`Phone: ${txn.customerPhone}`, 20, y);
        y += 5;
      }
      y += 3;
    }

    // Separator
    doc.setDrawColor(0);
    doc.line(20, y, pageWidth - 20, y);
    y += 7;

    // Column headers (full tax columns)
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text("Description", 20, y);
    doc.text("Qty", 100, y);
    doc.text("Unit Price", 120, y, { align: "right" });
    doc.text("Taxable", 150, y, { align: "right" });
    doc.text("VAT", 170, y, { align: "right" });
    doc.text("Amount", 195, y, { align: "right" });
    y += 5;
    doc.line(20, y, pageWidth - 20, y);
    y += 6;

    // Line items with per-line tax
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);

    txn.items.forEach((item) => {
      const lineTaxable = item.qty * item.price;
      const lineVat = Math.round(lineTaxable * (txn.vatRate / 100));
      const lineTotal = lineTaxable + lineVat;

      const nameLines = doc.splitTextToSize(item.name, 78);
      doc.text(nameLines, 20, y);
      const nameHeight = nameLines.length * 4.5;

      doc.text(String(item.qty), 100, y);
      doc.text(item.price.toFixed(0), 120, y, { align: "right" });
      doc.text(lineTaxable.toFixed(0), 150, y, { align: "right" });
      doc.text(`${txn.vatRate}%`, 170, y, { align: "right" });
      doc.text(lineTotal.toFixed(0), 195, y, { align: "right" });

      y += Math.max(nameHeight, 5) + 2;
    });

    y += 4;
    doc.line(20, y, pageWidth - 20, y);
    y += 7;

    // Totals (right aligned)
    const colRight = 195;
    const labelX = 130;

    doc.setFontSize(10);
    doc.text("Subtotal", labelX, y);
    doc.text(txn.subtotal.toFixed(0), colRight, y, { align: "right" });
    y += 6;

    if (txn.discount > 0) {
      doc.text("Discount", labelX, y);
      doc.text(`-${txn.discount.toFixed(0)}`, colRight, y, { align: "right" });
      y += 6;
    }

    doc.text(`Taxable Value`, labelX, y);
    doc.text(txn.taxableValue.toFixed(0), colRight, y, { align: "right" });
    y += 6;

    doc.text(`VAT @ ${txn.vatRate}%`, labelX, y);
    doc.text(txn.vatAmount.toFixed(0), colRight, y, { align: "right" });
    y += 7;

    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("TOTAL", labelX, y);
    doc.text(txn.grandTotal.toFixed(0), colRight, y, { align: "right" });
    y += 8;

    // Amount in words (required for tax invoices)
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    const words = amountInWords(txn.grandTotal);
    const wordsLines = doc.splitTextToSize(`Amount in words: ${words}`, 170);
    doc.text(wordsLines, 20, y);
    y += wordsLines.length * 5 + 6;

    // Legal footer for tax mode
    doc.setFontSize(8);
    doc.text("This is a computer generated TAX INVOICE issued under the provisions of the Value Added Tax Act.", 20, y);
    y += 4;
    doc.text("Please retain this document for your records. For any queries contact the issuer with the Invoice Number above.", 20, y);

    // Signature
    y += 12;
    doc.text("Authorized Signature: ________________________", 20, y);
    doc.text("Date: _______________", 130, y);

  } else {
    // ========== NORMAL RECEIPT MODE (clean, no tax/VAT claims) ==========
    // Centered business header
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text(org.legalName || "YOUR BUSINESS", pageWidth / 2, y, { align: "center" });
    y += 6;

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    if (org.address) {
      const addrLines = doc.splitTextToSize(org.address, 140);
      doc.text(addrLines, pageWidth / 2, y, { align: "center" });
      y += addrLines.length * 5;
    }
    if (org.contactPhone) {
      doc.text(`Tel: ${org.contactPhone}`, pageWidth / 2, y, { align: "center" });
      y += 7;
    }

    // Receipt meta line
    doc.setFontSize(10);
    doc.text(`Receipt No: ${txn.invoiceNumber}`, 20, y);
    doc.text(`Date: ${txn.createdAt.toLocaleDateString("en-LK")} ${txn.createdAt.toLocaleTimeString("en-LK", { hour: "2-digit", minute: "2-digit" })}`, pageWidth - 20, y, { align: "right" });
    y += 7;

    // Optional customer line (for orders)
    if (txn.customerName || txn.customerPhone) {
      doc.setFontSize(9);
      let cust = "Customer: ";
      if (txn.customerName) cust += txn.customerName;
      if (txn.customerPhone) cust += (txn.customerName ? " • " : "") + txn.customerPhone;
      doc.text(cust, 20, y);
      y += 6;
    }

    // Separator
    doc.setDrawColor(0);
    doc.line(20, y, pageWidth - 20, y);
    y += 6;

    // Simple column headers (no tax columns)
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text("Description", 20, y);
    doc.text("Qty", 110, y);
    doc.text("Unit Price", 140, y, { align: "right" });
    doc.text("Total", 190, y, { align: "right" });
    y += 4;
    doc.line(20, y, pageWidth - 20, y);
    y += 5;

    // Line items (simple)
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);

    txn.items.forEach((item) => {
      const lineTotal = item.qty * item.price;
      const nameLines = doc.splitTextToSize(item.name, 85);
      doc.text(nameLines, 20, y);
      const nameHeight = nameLines.length * 4.5;

      doc.text(String(item.qty), 110, y);
      doc.text(item.price.toFixed(0), 140, y, { align: "right" });
      doc.text(lineTotal.toFixed(0), 190, y, { align: "right" });

      y += Math.max(nameHeight, 5) + 2;
    });

    y += 4;
    doc.line(20, y, pageWidth - 20, y);
    y += 7;

    // Simple totals (right aligned)
    const colRight = 190;
    const labelX = 130;

    doc.setFontSize(10);
    doc.text("Subtotal", labelX, y);
    doc.text(txn.subtotal.toFixed(0), colRight, y, { align: "right" });
    y += 6;

    if (txn.discount > 0) {
      doc.text("Discount", labelX, y);
      doc.text(`-${txn.discount.toFixed(0)}`, colRight, y, { align: "right" });
      y += 6;
    }

    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("TOTAL", labelX, y);
    doc.text(txn.grandTotal.toFixed(0), colRight, y, { align: "right" });
    y += 8;

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Payment: ${txn.paymentMethod}`, 20, y);
    y += 10;

    // Simple footer
    doc.setFontSize(10);
    doc.text("Thank you for your business!", pageWidth / 2, y, { align: "center" });
    y += 6;
    doc.setFontSize(8);
    doc.text("This is a computer generated receipt.", pageWidth / 2, y, { align: "center" });
  }

  // Filename (works for both modes)
  const safeName = (txn.invoiceNumber || (isTax ? "TAX-INVOICE" : "RECEIPT")).replace(/[^a-zA-Z0-9-]/g, "");
  doc.save(`${safeName}.pdf`);
}

/* =========================================================
   2. THERMAL RECEIPT (narrow HTML for 80mm / 58mm printers)
   ========================================================= */

export function generateThermalReceiptHTML(rawOrg: Organization, rawTxn: any): string {
  const isTax = !!(rawOrg && (rawOrg as any).issuesTaxInvoices === true);
  const { org, txn } = prepareRenderData(rawOrg, rawTxn);

  const dateStr = txn.createdAt.toLocaleDateString("en-LK");
  const timeStr = txn.createdAt.toLocaleTimeString("en-LK", { hour: "2-digit", minute: "2-digit" });

  const itemsHTML = txn.items
    .map((item) => {
      const lineTotal = Math.round(item.qty * item.price);
      return `
        <div class="item">
          <div class="item-name">${escapeHtml(item.name)}</div>
          <div class="item-qty">${item.qty} × ${item.price.toFixed(0)}</div>
          <div class="item-total">${lineTotal.toFixed(0)}</div>
        </div>
      `;
    })
    .join("");

  const discountHTML = txn.discount > 0
    ? `<div class="row"><span>Discount</span><span>-${txn.discount.toFixed(0)}</span></div>`
    : "";

  let totalsSection: string;
  let footerNote: string;

  if (isTax) {
    // Tax mode: full breakdown + classic tax note
    totalsSection = `
      <div class="row"><span>Subtotal</span><span>${txn.subtotal.toFixed(0)}</span></div>
      ${discountHTML}
      <div class="row"><span>Taxable</span><span>${txn.taxableValue.toFixed(0)}</span></div>
      <div class="row"><span>VAT @ ${txn.vatRate}%</span><span>${txn.vatAmount.toFixed(0)}</span></div>
      <div class="row total"><span>TOTAL</span><span>${txn.grandTotal.toFixed(0)}</span></div>
    `;
    footerNote = `<div class="tax-note">This is a computer generated TAX INVOICE<br/>IRD Gazette compliant • Retain for records</div>`;
  } else {
    // Normal receipt: simple totals, clean note
    totalsSection = `
      <div class="row"><span>Subtotal</span><span>${txn.subtotal.toFixed(0)}</span></div>
      ${discountHTML}
      <div class="row total"><span>TOTAL</span><span>${txn.grandTotal.toFixed(0)}</span></div>
    `;
    footerNote = `<div class="tax-note">Thank you • Computer generated receipt</div>`;
  }

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${isTax ? "Tax Invoice" : "Receipt"} ${txn.invoiceNumber}</title>
  <style>
    @page {
      size: 80mm auto;
      margin: 0;
    }
    * { box-sizing: border-box; }
    body {
      font-family: "Courier New", Courier, monospace;
      font-size: 11pt;
      line-height: 1.25;
      margin: 0;
      padding: 4mm 4mm 6mm;
      width: 80mm;
      color: #000;
      background: #fff;
    }
    .center { text-align: center; }
    .bold { font-weight: bold; }
    .big { font-size: 14pt; }
    .huge { font-size: 16pt; font-weight: bold; }

    .header { margin-bottom: 3mm; border-bottom: 1px dashed #000; padding-bottom: 2mm; }
    .biz-name { font-size: 13pt; font-weight: bold; }
    .meta { font-size: 9pt; margin-top: 1mm; }

    .items { margin: 3mm 0; }
    .item {
      display: flex;
      justify-content: space-between;
      margin-bottom: 1.5mm;
      font-size: 10pt;
    }
    .item-name { flex: 1; padding-right: 2mm; word-break: break-word; }
    .item-qty { width: 28mm; text-align: right; }
    .item-total { width: 18mm; text-align: right; font-weight: 600; }

    .totals {
      border-top: 1px dashed #000;
      padding-top: 2mm;
      margin-top: 2mm;
      font-size: 10pt;
    }
    .row { display: flex; justify-content: space-between; margin: 0.8mm 0; }
    .row.total { font-size: 13pt; font-weight: bold; border-top: 1px solid #000; padding-top: 1.5mm; margin-top: 1.5mm; }

    .words {
      margin: 2mm 0;
      font-size: 9pt;
      border: 1px dashed #000;
      padding: 1.5mm;
    }

    .footer {
      margin-top: 4mm;
      font-size: 8pt;
      text-align: center;
      border-top: 1px dashed #000;
      padding-top: 2mm;
    }
    .tax-note { font-size: 7.5pt; margin-top: 1mm; }

    @media print {
      body { width: 80mm; padding: 2mm 3mm; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="header center">
    ${org.legalName ? `<div class="biz-name">${escapeHtml(org.legalName)}</div>` : ""}
    ${isTax && org.tin ? `<div>TIN: ${escapeHtml(org.tin)}</div>` : ""}
    ${org.address ? `<div style="font-size:9pt">${escapeHtml(org.address)}</div>` : ""}
    ${org.contactPhone ? `<div>Tel: ${escapeHtml(org.contactPhone)}</div>` : ""}
  </div>

  <div class="meta center">
    <div><strong>${txn.type === "order" ? "ORDER" : "SALE"}</strong> • ${txn.invoiceNumber}</div>
    <div>${dateStr} ${timeStr}</div>
    <div>Payment: ${txn.paymentMethod}</div>
  </div>

  <div class="items">
    ${itemsHTML}
  </div>

  <div class="totals">
    ${totalsSection}
  </div>

  ${isTax ? `<div class="words center">${escapeHtml(amountInWords(txn.grandTotal))}</div>` : ""}

  ${txn.customerName ? `<div style="font-size:9pt;margin-top:2mm">Customer: ${escapeHtml(txn.customerName)}</div>` : ""}

  <div class="footer">
    <div>*** THANK YOU ***</div>
    ${footerNote}
  </div>

  <script>
    window.onload = function() { /* controlled by caller */ };
  </script>
</body>
</html>`;

  return html;
}

export function printThermalReceipt(rawOrg: Organization, rawTxn: any): void {
  const html = generateThermalReceiptHTML(rawOrg, rawTxn);
  const w = window.open("", "_blank", "width=320,height=700,menubar=no,toolbar=no,location=no,status=no");
  if (!w) {
    alert("Please allow pop-ups to print the thermal receipt.");
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();

  // Give the browser a moment to parse styles then print
  setTimeout(() => {
    try {
      w.focus();
      w.print();
    } catch (e) {
      // User can manually print if blocked
    }
  }, 350);
}

/* =========================================================
   3. Plain text version (great for WhatsApp / SMS)
   ========================================================= */

export function generateWhatsAppText(rawOrg: Organization, rawTxn: any): string {
  const isTax = !!(rawOrg && (rawOrg as any).issuesTaxInvoices === true);
  const { org, txn } = prepareRenderData(rawOrg, rawTxn);

  const lines: string[] = [];

  if (isTax) {
    lines.push(`*TAX INVOICE* - ${txn.invoiceNumber}`);
  } else {
    lines.push(`*RECEIPT* - ${txn.invoiceNumber}`);
  }

  lines.push(org.legalName || "Your Business");
  if (isTax && org.tin) lines.push(`TIN: ${org.tin}`);
  lines.push(`${txn.createdAt.toLocaleDateString("en-LK")} ${txn.createdAt.toLocaleTimeString("en-LK", { hour: "2-digit", minute: "2-digit" })}`);
  lines.push(`Payment: ${txn.paymentMethod}`);
  lines.push("---");

  txn.items.forEach((it) => {
    const lt = Math.round(it.qty * it.price);
    lines.push(`${it.name} ×${it.qty} @ ${it.price} = ${lt}`);
  });

  lines.push("---");
  if (txn.discount > 0) lines.push(`Discount: -${txn.discount}`);

  if (isTax) {
    lines.push(`VAT @ ${txn.vatRate}%: ${txn.vatAmount}`);
    lines.push(`*TOTAL: ${txn.grandTotal} LKR*`);
    lines.push(amountInWords(txn.grandTotal));
    lines.push("");
    lines.push("Thank you! This is a valid computer generated TAX INVOICE.");
  } else {
    lines.push(`*TOTAL: ${txn.grandTotal} LKR*`);
    lines.push("");
    lines.push("Thank you! This is a computer generated receipt.");
  }

  return lines.join("\n");
}

/* =========================================================
   Helpers
   ========================================================= */

function prepareRenderData(rawOrg: Organization, rawTxn: any) {
  const org: Organization = {
    ...rawOrg,
    defaultVatRate: rawOrg.defaultVatRate ?? 18,
  };
  const txn = normalizeTxn(rawTxn);
  return { org, txn };
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
