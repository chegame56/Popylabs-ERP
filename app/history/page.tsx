"use client";

import AppLayout from "@/components/AppLayout";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Transaction } from "@/lib/types";
import { collection, query, where, orderBy, limit, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import jsPDF from "jspdf";
import { amountInWords } from "@/lib/utils";
import { toast } from "sonner";

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
        toast.error("Failed to load transaction history");
        setLoading(false);
      }
    );

    return () => unsub();
  }, [organization]);

  const regeneratePdf = (txn: Transaction) => {
    try {
      const doc = new jsPDF();
      doc.setFontSize(16);
      doc.text("TAX INVOICE", 105, 20, { align: "center" });

      doc.setFontSize(11);
      // We don't have full org here, but we have what was recorded at sale time
      doc.text(organization?.legalName || "Your Business", 20, 32);
      if (organization?.tin) doc.text(`TIN: ${organization.tin}`, 20, 38);
      doc.text(`Invoice No: ${txn.invoiceNumber}`, 20, 44);
      doc.text(`Date: ${txn.createdAt?.toDate ? txn.createdAt.toDate().toLocaleDateString() : new Date().toLocaleDateString()}`, 20, 50);
      doc.text(`Payment: ${txn.paymentMethod}`, 20, 56);

      if (txn.customerName) {
        doc.text(`Customer: ${txn.customerName}`, 20, 62);
      }

      let y = 72;
      doc.setFontSize(10);
      txn.items.forEach((item) => {
        doc.text(`${item.name} x${item.qty}`, 20, y);
        doc.text(`LKR ${(item.price * item.qty).toFixed(0)}`, 160, y, { align: "right" });
        y += 7;
      });

      y += 4;
      doc.text(`Subtotal: LKR ${txn.subtotal}`, 160, y, { align: "right" });
      y += 7;
      if (txn.discount > 0) doc.text(`Discount: LKR ${txn.discount}`, 160, y, { align: "right" });
      y += 7;
      doc.setFontSize(12);
      doc.text(`TOTAL: LKR ${txn.total}`, 160, y, { align: "right" });

      y += 10;
      doc.setFontSize(10);
      doc.text(amountInWords(txn.total), 20, y);

      doc.text("Thank you for your business!", 105, y + 20, { align: "center" });

      doc.save(`${txn.invoiceNumber}.pdf`);
      toast.success("PDF regenerated");
    } catch (e) {
      toast.error("Could not regenerate PDF");
    }
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
                  <div className="font-medium">LKR {txn.total}</div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      regeneratePdf(txn);
                    }}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    Download PDF
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Detail modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center z-50 p-4">
          <div className="bg-white w-full md:w-[460px] rounded-t-2xl md:rounded-2xl p-6">
            <h3 className="font-semibold text-lg">Invoice {selected.invoiceNumber}</h3>
            <p className="text-sm text-gray-500 mt-0.5">
              {selected.createdAt?.toDate?.().toLocaleString() || ""} • {selected.paymentMethod}
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
              <div className="flex justify-between font-semibold text-base pt-1 border-t">
                <span>Total</span>
                <span>LKR {selected.total}</span>
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button onClick={() => setSelected(null)} className="flex-1 py-3 rounded-xl border">
                Close
              </button>
              <button
                onClick={() => {
                  regeneratePdf(selected);
                }}
                className="flex-1 py-3 rounded-xl bg-black text-white"
              >
                Download PDF again
              </button>
            </div>
          </div>
        </div>
      )}

      <p className="mt-6 text-xs text-gray-500 text-center">
        Showing up to the last 100 transactions for your organization.
      </p>
    </AppLayout>
  );
}
