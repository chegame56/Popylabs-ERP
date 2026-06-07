// Shared domain types for Popylabs ERP
// Aligned with IRD Gazette 2463/05 VAT Tax Invoice requirements + dual PDF/thermal needs.

export interface Organization {
  id: string;
  legalName: string;
  tin?: string;                    // 9 or 12 digit TIN (e.g. 123456789V or 123456789000)
  address?: string;                // Place of business / place of supply
  contactPhone?: string;
  logoUrl?: string;                // Public URL (http/https) to small logo. Keep < 100KB recommended.
  defaultVatRate: number;          // e.g. 18 for current standard rate
  invoicePrefix: string;           // e.g. "INV-" or "TAX-"
  nextInvoiceSequence: number;
  lastSequenceResetMonth?: string; // "2026-06" for future monthly/branch reset support
  branchCode?: string;             // e.g. "BR01" for future multi-branch serials
  lowStockThreshold?: number;
  ownerUid?: string;
  createdAt?: any;
}

export interface Product {
  id: string;
  organizationId: string;
  name: string;
  price: number;                   // Base unit price (currently treated as taxable/ex-VAT price)
  stock: number;
  barcode?: string;
  imageUrl?: string;               // public URL only (no Storage)
  createdAt?: any;
  updatedAt?: any;
}

export interface SaleItem {
  productId: string;
  name: string;
  price: number;                   // unit price at time of sale (taxable)
  qty: number;
}

export interface Transaction {
  id: string;
  organizationId: string;
  type: "sale" | "order";
  invoiceNumber: string;           // e.g. INV-2606000123
  items: SaleItem[];
  subtotal: number;                // sum(line qty * price)
  discount: number;                // fixed discount amount
  vatRate: number;                 // e.g. 18
  vatAmount: number;
  taxableValue: number;            // subtotal - discount (base for VAT)
  grandTotal: number;              // taxableValue + vatAmount  (what customer pays)
  // Keep 'total' for legacy compatibility with old txns (maps to grandTotal)
  total?: number;
  paymentMethod: "Cash" | "Card" | "Bank Transfer" | "COD" | "Other";
  customerName?: string;
  customerPhone?: string;
  source?: "IG" | "FB" | "WA" | "Other" | string; // order source
  placeOfSupply?: string;          // Usually seller address or specific location
  createdAt: any;                  // Firestore Timestamp
  createdByUid?: string;
}
