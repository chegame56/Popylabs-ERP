import jsPDF from "jspdf";
import { Organization, Transaction } from "./types";
import { amountInWords, formatLKR } from "./utils";

/**
 * Sri Lanka IRD-Compliant Dual Thermal PDF Invoice System (v1)
 *
 * - Professional PDF: full A4-ish layout for records, email, WhatsApp, accountant/IRD acceptance.
 * - Thermal receipt: narrow 80mm (or 58mm) HTML optimized for thermal printers + window.print.
 * - Pure functions: re-generate anytime from immutable stored Transaction + Organization snapshot.
 * - Follows Gazette No. 2463/05 key requirements (TAX INVOICE, TINs, serial, dates, place of supply,
 *   payment mode, VAT breakdown, amount in words, LKR, proper structure).
 *
 * Update these functions when IRD publishes clarifications or new gazettes.
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
   1. PROFESSIONAL PDF (jsPDF) — IRD TAX INVOICE
   ========================================================= */

export function generateProfessionalPDF(rawOrg: Organization, rawTxn: any): void {
  const { org, txn } = prepareRenderData(rawOrg, rawTxn);

  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth(); // ~210mm A4
  let y = 18;

  // Header
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("TAX INVOICE", pageWidth / 2, y, { align: "center" });
  y += 8;

  // Seller block (left)
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text(org.legalName || "YOUR BUSINESS NAME", 20, y);
  y += 6;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  if (org.address) {
    const addrLines = doc.splitTextToSize(org.address, 90);
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

  // Right side invoice meta
  let rightY = 26;
  doc.setFontSize(10);
  doc.text(`Invoice No: ${txn.invoiceNumber}`, 120, rightY);
  rightY += 6;
  doc.text(`Date: ${txn.createdAt.toLocaleDateString("en-LK")} ${txn.createdAt.toLocaleTimeString("en-LK", { hour: "2-digit", minute: "2-digit" })}`, 120, rightY);
  rightY += 6;
  doc.text(`Payment: ${txn.paymentMethod}`, 120, rightY);
  rightY += 6;

  const place = txn.placeOfSupply || org.address || "Sri Lanka";
  doc.text(`Place of Supply: ${place}`, 120, rightY);

  y = Math.max(y, rightY) + 8;

  // Customer (if present)
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

  // Separator line
  doc.setDrawColor(0);
  doc.line(20, y, pageWidth - 20, y);
  y += 7;

  // Column headers
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("Description", 20, y);
  doc.text("Qty", 105, y);
  doc.text("Unit Price", 125, y, { align: "right" });
  doc.text("Taxable", 155, y, { align: "right" });
  doc.text("VAT", 175, y, { align: "right" });
  doc.text("Amount", 195, y, { align: "right" });
  y += 5;
  doc.line(20, y, pageWidth - 20, y);
  y += 6;

  // Line items
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);

  txn.items.forEach((item) => {
    const lineTaxable = item.qty * item.price;
    const lineVat = Math.round(lineTaxable * (txn.vatRate / 100));
    const lineTotal = lineTaxable + lineVat;

    // Name (wrap if long)
    const nameLines = doc.splitTextToSize(item.name, 80);
    doc.text(nameLines, 20, y);
    const nameHeight = nameLines.length * 4.5;

    doc.text(String(item.qty), 105, y);
    doc.text(item.price.toFixed(0), 125, y, { align: "right" });
    doc.text(lineTaxable.toFixed(0), 155, y, { align: "right" });
    doc.text(`${txn.vatRate}%`, 175, y, { align: "right" });
    doc.text(lineTotal.toFixed(0), 195, y, { align: "right" });

    y += Math.max(nameHeight, 5) + 2;
  });

  y += 4;
  doc.line(20, y, pageWidth - 20, y);
  y += 7;

  // Totals block (right aligned)
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

  // Amount in words (mandatory)
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  const words = amountInWords(txn.grandTotal);
  const wordsLines = doc.splitTextToSize(`Amount in words: ${words}`, 170);
  doc.text(wordsLines, 20, y);
  y += wordsLines.length * 5 + 6;

  // Footer / legal note
  doc.setFontSize(8);
  doc.text("This is a computer generated TAX INVOICE issued under the provisions of the Value Added Tax Act.", 20, y);
  y += 4;
  doc.text("Please retain this document for your records. For any queries contact the issuer with the Invoice Number above.", 20, y);

  // Signature area (common on SL invoices)
  y += 12;
  doc.text("Authorized Signature: ________________________", 20, y);
  doc.text("Date: _______________", 130, y);

  // Filename friendly
  const safeName = (txn.invoiceNumber || "TAX-INVOICE").replace(/[^a-zA-Z0-9-]/g, "");
  doc.save(`${safeName}.pdf`);
}

/* =========================================================
   2. THERMAL RECEIPT (narrow HTML for 80mm / 58mm printers)
   ========================================================= */

export function generateThermalReceiptHTML(rawOrg: Organization, rawTxn: any): string {
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

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Receipt ${txn.invoiceNumber}</title>
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
    ${org.tin ? `<div>TIN: ${escapeHtml(org.tin)}</div>` : ""}
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
    <div class="row"><span>Subtotal</span><span>${txn.subtotal.toFixed(0)}</span></div>
    ${discountHTML}
    <div class="row"><span>Taxable</span><span>${txn.taxableValue.toFixed(0)}</span></div>
    <div class="row"><span>VAT @ ${txn.vatRate}%</span><span>${txn.vatAmount.toFixed(0)}</span></div>
    <div class="row total"><span>TOTAL</span><span>${txn.grandTotal.toFixed(0)}</span></div>
  </div>

  <div class="words center">
    ${escapeHtml(amountInWords(txn.grandTotal))}
  </div>

  ${txn.customerName ? `<div style="font-size:9pt;margin-top:2mm">Customer: ${escapeHtml(txn.customerName)}</div>` : ""}

  <div class="footer">
    <div>*** THANK YOU ***</div>
    <div class="tax-note">This is a computer generated TAX INVOICE<br/>IRD Gazette compliant • Retain for records</div>
  </div>

  <script>
    // Auto print hint for some browsers
    window.onload = function() {
      // Do not auto-print here; the caller controls window.print()
    };
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
  const { org, txn } = prepareRenderData(rawOrg, rawTxn);

  const lines: string[] = [];
  lines.push(`*TAX INVOICE* - ${txn.invoiceNumber}`);
  lines.push(org.legalName || "Your Business");
  if (org.tin) lines.push(`TIN: ${org.tin}`);
  lines.push(`${txn.createdAt.toLocaleDateString("en-LK")} ${txn.createdAt.toLocaleTimeString("en-LK", { hour: "2-digit", minute: "2-digit" })}`);
  lines.push(`Payment: ${txn.paymentMethod}`);
  lines.push("---");

  txn.items.forEach((it) => {
    const lt = Math.round(it.qty * it.price);
    lines.push(`${it.name} ×${it.qty} @ ${it.price} = ${lt}`);
  });

  lines.push("---");
  if (txn.discount > 0) lines.push(`Discount: -${txn.discount}`);
  lines.push(`VAT @ ${txn.vatRate}%: ${txn.vatAmount}`);
  lines.push(`*TOTAL: ${txn.grandTotal} LKR*`);
  lines.push(amountInWords(txn.grandTotal));
  lines.push("");
  lines.push("Thank you! This is a valid computer generated TAX INVOICE.");

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
