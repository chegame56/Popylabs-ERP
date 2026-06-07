"use client";

import AppLayout from "@/components/AppLayout";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Transaction } from "@/lib/types";
import { collection, query, where, orderBy, limit, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { toast } from "sonner";
import { generateProfessionalPDF, printThermalReceipt, generateWhatsAppText } from "@/lib/invoice";

export default function HistoryPage() {
  const { organization } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Transaction | null>(null);

  useEffect(() => {
    if (!organization) {
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, "transactions"),
      where("organizationId", "==", organization.id),
      orderBy("createdAt", "desc"),
      limit(100)
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: Transaction[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as any),
        }));
        setTransactions(list);
        setLoading(false);
      },
      (err) => {
        console.error("History load error:", err);
        const code = err?.code || "";
        const msg = (err?.message || "").toLowerCase();
        if (code === "failed-precondition" || msg.includes("index")) {
          toast.error("Missing Firestore index. Deploy indexes: firebase deploy --only firestore:indexes");
        } else if (code === "permission-denied") {
          toast.error("Permission denied. Deploy Firestore rules.");
        } else {
          toast.error("Failed to load transaction history");
        }
        setLoading(false);
      }
    );

    return () => unsub();
  }, [organization]);

  // Re-generate using the shared IRD-compliant professional PDF generator (handles legacy txns too)
  const regeneratePdf = (txn: Transaction) => {
    if (!organization) {
      toast.error("Organization not loaded");
      return;
    }
    try {
      generateProfessionalPDF(organization, txn);
      toast.success("PDF downloaded");
    } catch (e) {
      toast.error("Could not regenerate PDF");
    }
  };

  const printThermal = (txn: Transaction) => {
    if (!organization) {
      toast.error("Organization not loaded");
      return;
    }
    printThermalReceipt(organization, txn);
  };

  const copyForWhatsApp = (txn: Transaction) => {
    if (!organization) {
      toast.error("Organization not loaded");
      return;
    }
    const text = generateWhatsAppText(organization, txn);
    navigator.clipboard.writeText(text).then(() => {
      toast.success("Invoice text copied — ready for WhatsApp");
    }).catch(() => {
      alert(text); // fallback
    });
  };

  if (!organization) {
    return (
      <AppLayout>
        <div className="p-8 text-center text-gray-500">Loading...</div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <h1 className="text-2xl font-semibold mb-4">History</h1>

      {loading && <div className="p-8 text-center text-gray-500">Loading transactions...</div>}

      {!loading && transactions.length === 0 && (
        <div className="bg-white rounded-2xl border p-8 text-center text-gray-500">
          No transactions yet. Complete a sale to see history here.
        </div>
      )}

      {!loading && transactions.length > 0 && (
        <div className="bg-white rounded-2xl border divide-y">
          {transactions.map((txn) => {
            const dateStr = txn.createdAt?.toDate
              ? txn.createdAt.toDate().toLocaleString()
              : "—";
            return (
              <div
                key={txn.id}
                className="px-4 py-4 flex items-center justify-between hover:bg-gray-50 cursor-pointer"
                onClick={() => setSelected(txn)}
              >
                <div>
                  <div className="font-medium">{txn.invoiceNumber}</div>
                  <div className="text-sm text-gray-500">
                    {dateStr} • {txn.type === "order" ? "Order" : "Sale"}
                    {txn.customerName ? ` • ${txn.customerName}` : ""}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-medium">LKR {txn.grandTotal ?? txn.total}</div>
                  <div className="flex gap-2 justify-end mt-0.5">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        regeneratePdf(txn);
                      }}
                      className="text-[10px] px-1.5 py-0.5 text-blue-600 hover:underline"
                    >
                      PDF
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        printThermal(txn);
                      }}
                      className="text-[10px] px-1.5 py-0.5 text-black hover:underline"
                    >
                      Thermal
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        copyForWhatsApp(txn);
                      }}
                      className="text-[10px] px-1.5 py-0.5 text-gray-600 hover:underline"
                    >
                      Copy
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Detail modal — shows full breakdown + all dual actions */}
      {selected && (
        <div className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center z-50 p-4">
          <div className="bg-white w-full md:w-[460px] rounded-t-2xl md:rounded-2xl p-6">
            <h3 className="font-semibold text-lg">Invoice {selected.invoiceNumber}</h3>
            <p className="text-sm text-gray-500 mt-0.5">
              {selected.createdAt?.toDate?.().toLocaleString() || ""} • {selected.paymentMethod}
              {selected.placeOfSupply ? ` • ${selected.placeOfSupply}` : ""}
            </p>

            <div className="mt-4 border-t pt-3 space-y-1 text-sm">
              {selected.items.map((it, idx) => (
                <div key={idx} className="flex justify-between">
                  <div>
                    {it.name} × {it.qty}
                  </div>
                  <div>LKR {(it.price * it.qty).toFixed(0)}</div>
                </div>
              ))}
            </div>

            <div className="mt-4 pt-3 border-t text-sm space-y-1">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span>LKR {selected.subtotal}</span>
              </div>
              {selected.discount > 0 && (
                <div className="flex justify-between">
                  <span>Discount</span>
                  <span>− LKR {selected.discount}</span>
                </div>
              )}
              {typeof selected.taxableValue === "number" && (
                <div className="flex justify-between">
                  <span>Taxable Value</span>
                  <span>LKR {selected.taxableValue}</span>
                </div>
              )}
              {typeof selected.vatRate === "number" && typeof selected.vatAmount === "number" && (
                <div className="flex justify-between">
                  <span>VAT @ {selected.vatRate}%</span>
                  <span>LKR {selected.vatAmount}</span>
                </div>
              )}
              <div className="flex justify-between font-semibold text-base pt-1 border-t">
                <span>Total (incl. VAT)</span>
                <span>LKR {selected.grandTotal ?? selected.total}</span>
              </div>
            </div>

            {(selected.customerName || selected.customerPhone) && (
              <div className="mt-3 text-xs text-gray-600">
                {selected.customerName && <div>Customer: {selected.customerName}</div>}
                {selected.customerPhone && <div>Phone: {selected.customerPhone}</div>}
              </div>
            )}

            <div className="mt-6 grid grid-cols-2 gap-2 text-sm">
              <button onClick={() => setSelected(null)} className="py-3 rounded-xl border col-span-2 md:col-span-1">
                Close
              </button>
              <button
                onClick={() => {
                  regeneratePdf(selected);
                }}
                className="py-3 rounded-xl border border-emerald-700 text-emerald-700 md:col-span-1"
              >
                Download PDF
              </button>
              <button
                onClick={() => printThermal(selected)}
                className="py-3 rounded-xl bg-black text-white"
              >
                Print Thermal (80mm)
              </button>
              <button
                onClick={() => copyForWhatsApp(selected)}
                className="py-3 rounded-xl border"
              >
                Copy WhatsApp Text
              </button>
            </div>

            <p className="mt-3 text-center text-[10px] text-gray-400">
              Both outputs are designed to meet Sri Lanka IRD VAT Tax Invoice requirements.
            </p>
          </div>
        </div>
      )}

      <p className="mt-6 text-xs text-gray-500 text-center">
        Showing up to the last 100 transactions for your organization.
      </p>
    </AppLayout>
  );
}
