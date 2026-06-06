import { format } from "date-fns";

/**
 * Convert number to words for Sri Lankan TAX INVOICE (LKR)
 * Basic implementation for v1. Extend as needed.
 */
export function amountInWords(amount: number): string {
  const ones = [
    "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
    "Seventeen", "Eighteen", "Nineteen",
  ];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

  if (amount === 0) return "Zero Rupees Only";

  const num = Math.floor(amount);
  let words = "";

  if (num >= 100000) {
    words += ones[Math.floor(num / 100000)] + " Hundred Thousand ";
    // simplistic for now
  }

  const remainder = num % 100000;

  if (remainder >= 1000) {
    words += ones[Math.floor(remainder / 1000)] + " Thousand ";
  }

  const lastThree = remainder % 1000;
  const hundreds = Math.floor(lastThree / 100);
  const lastTwo = lastThree % 100;

  if (hundreds) {
    words += ones[hundreds] + " Hundred ";
  }

  if (lastTwo >= 20) {
    words += tens[Math.floor(lastTwo / 10)] + " ";
    if (lastTwo % 10) words += ones[lastTwo % 10] + " ";
  } else if (lastTwo > 0) {
    words += ones[lastTwo] + " ";
  }

  words = words.trim();
  if (!words) words = "Zero";

  return `${words} Rupees Only`;
}

/** Simple invoice number generator (will be replaced by server/org sequence) */
export function generateInvoiceNumber(prefix: string = "INV-", sequence: number = 1) {
  const now = new Date();
  const yy = format(now, "yy");
  const mm = format(now, "MM");
  const seq = sequence.toString().padStart(4, "0");
  return `${prefix}${yy}${mm}${seq}`;
}
