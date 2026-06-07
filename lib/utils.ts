import { format } from "date-fns";

/**
 * Robust number to words for Sri Lankan LKR TAX INVOICES.
 * Supports up to several crores (plenty for retail). Uses "Rupees Only".
 * Handles whole rupees (current model). Extend with cents if you ever store paise.
 */
export function amountInWords(amount: number): string {
  if (!amount || amount < 0) return "Zero Rupees Only";

  const num = Math.floor(amount);

  if (num === 0) return "Zero Rupees Only";

  const ones = [
    "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
    "Seventeen", "Eighteen", "Nineteen",
  ];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

  function convertLessThanOneThousand(n: number): string {
    if (n === 0) return "";
    let s = "";
    if (n >= 100) {
      s += ones[Math.floor(n / 100)] + " Hundred ";
      n %= 100;
    }
    if (n >= 20) {
      s += tens[Math.floor(n / 10)] + " ";
      n %= 10;
    }
    if (n > 0) {
      s += ones[n] + " ";
    }
    return s.trim();
  }

  let words = "";

  // Crores (10,000,000)
  if (num >= 10000000) {
    words += convertLessThanOneThousand(Math.floor(num / 10000000)) + " Crore ";
  }

  // Lakhs (100,000)
  const lakhs = Math.floor((num % 10000000) / 100000);
  if (lakhs > 0) {
    words += ones[lakhs] + " Lakh ";
  }

  // Thousands
  const thousands = Math.floor((num % 100000) / 1000);
  if (thousands > 0) {
    words += ones[thousands] + " Thousand ";
  }

  // Remainder < 1000
  const remainder = num % 1000;
  if (remainder > 0) {
    words += convertLessThanOneThousand(remainder) + " ";
  }

  words = words.trim();
  if (!words) words = "Zero";

  return `${words} Rupees Only`;
}

/** Invoice number using org prefix + YYMM + 4-digit sequence (simple, auditable, branch-extendable). */
export function generateInvoiceNumber(prefix: string = "INV-", sequence: number = 1) {
  const now = new Date();
  const yy = format(now, "yy");
  const mm = format(now, "MM");
  const seq = sequence.toString().padStart(4, "0");
  return `${prefix}${yy}${mm}${seq}`;
}

/** Compute full IRD-compliant breakdown from cart values + org VAT rate. */
export interface InvoiceTotals {
  subtotal: number;
  discount: number;
  taxableValue: number;
  vatRate: number;
  vatAmount: number;
  grandTotal: number;
}

export function computeInvoiceTotals(
  subtotal: number,
  discount: number,
  vatRatePercent: number = 18
): InvoiceTotals {
  const safeSubtotal = Math.max(0, subtotal || 0);
  const safeDiscount = Math.max(0, Math.min(discount || 0, safeSubtotal));
  const taxableValue = Math.max(0, safeSubtotal - safeDiscount);
  const vatRate = Math.max(0, vatRatePercent || 0);
  // Round to nearest rupee (or keep 2 decimals if you ever support cents)
  const vatAmount = Math.round(taxableValue * (vatRate / 100));
  const grandTotal = taxableValue + vatAmount;

  return {
    subtotal: safeSubtotal,
    discount: safeDiscount,
    taxableValue,
    vatRate,
    vatAmount,
    grandTotal,
  };
}

/** Small helper for consistent LKR display (no decimals for now). */
export function formatLKR(amount: number): string {
  return `LKR ${Math.round(amount).toLocaleString("en-LK")}`;
}
