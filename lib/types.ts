// Shared domain types for Popylabs ERP

export interface Organization {
  id: string;
  legalName: string;
  tin?: string;
  address?: string;
  invoicePrefix: string;
  nextInvoiceSequence: number;
  defaultVatRate?: number;
  lowStockThreshold?: number;
  ownerUid?: string;
  createdAt?: any;
}

export interface Product {
  id: string;
  organizationId: string;
  name: string;
  price: number;
  stock: number;
  barcode?: string;
  imageUrl?: string; // public URL only (no Storage)
  createdAt?: any;
  updatedAt?: any;
}

export interface SaleItem {
  productId: string;
  name: string;
  price: number;
  qty: number;
}

export interface Transaction {
  id: string;
  organizationId: string;
  type: "sale" | "order";
  invoiceNumber: string;
  items: SaleItem[];
  subtotal: number;
  discount: number;
  total: number;
  paymentMethod: "Cash" | "Card" | "Transfer";
  customerName?: string;
  createdAt: any; // Firestore Timestamp
  // Future: createdByUid, notes, etc.
}
