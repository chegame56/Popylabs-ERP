"use client";

import AppLayout from "@/components/AppLayout";
import { useSearchParams } from "next/navigation";
import { useState, Suspense } from "react";
import jsPDF from "jspdf";
import { amountInWords, generateInvoiceNumber } from "@/lib/utils";

interface CartItem {
  id: string;
  name: string;
  price: number;
  qty: number;
}

const demoProducts = [
  { id: "p1", name: "Coca Cola 1L", price: 280 },
  { id: "p2", name: "White Bread", price: 120 },
  { id: "p3", name: "Eggs (10 pack)", price: 380 },
  { id: "p4", name: "Rice 1kg", price: 220 },
];

function SaleContent() {
  const searchParams = useSearchParams();
  const mode = searchParams.get("mode") === "order" ? "order" : "sale";

  const [cart, setCart] = useState<CartItem[]>([]);
  const [discount, setDiscount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<"Cash" | "Card" | "Transfer">("Cash");
  const [customerName, setCustomerName] = useState("");
  const [showInvoice, setShowInvoice] = useState(false);
  const [lastInvoiceNumber, setLastInvoiceNumber] = useState("");

  const subtotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  const total = Math.max(0, subtotal - discount);

  const addToCart = (product: { id: string; name: string; price: number }) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.id === product.id);
      if (existing) {
        return prev.map((i) =>
          i.id === product.id ? { ...i, qty: i.qty + 1 } : i
        );
      }
      return [...prev, { ...product, qty: 1 }];
    });
  };

  const updateQty = (id: string, newQty: number) => {
    if (newQty < 1) return;
    setCart((prev) => prev.map((i) => (i.id === id ? { ...i, qty: newQty } : i)));
  };

  const removeItem = (id: string) => {
    setCart((prev) => prev.filter((i) => i.id !== id));
  };

  const completeSale = () => {
    if (cart.length === 0) return;

    const invoiceNumber = generateInvoiceNumber("INV-", Math.floor(Math.random() * 900) + 100);

    // Generate real PDF (IRD style - simplified for v1)
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text("TAX INVOICE", 105, 20, { align: "center" });

    doc.setFontSize(11);
    doc.text("Popylabs Demo Business", 20, 32);
    doc.text("TIN: 123456789V", 20, 38);
    doc.text(`Invoice No: ${invoiceNumber}`, 20, 44);
    doc.text(`Date: ${new Date().toLocaleDateString()}`, 20, 50);
    doc.text(`Payment: ${paymentMethod}`, 20, 56);

    if (mode === "order" && customerName) {
      doc.text(`Customer: ${customerName}`, 20, 62);
    }

    // Items
    let y = 72;
    doc.setFontSize(10);
    cart.forEach((item) => {
      doc.text(`${item.name} x${item.qty}`, 20, y);
      doc.text(`LKR ${(item.price * item.qty).toFixed(0)}`, 160, y, { align: "right" });
      y += 7;
    });

    y += 4;
    doc.text(`Subtotal: LKR ${subtotal}`, 160, y, { align: "right" });
    y += 7;
    if (discount > 0) doc.text(`Discount: LKR ${discount}`, 160, y, { align: "right" });
    y += 7;
    doc.setFontSize(12);
    doc.text(`TOTAL: LKR ${total}`, 160, y, { align: "right" });

    y += 10;
    doc.setFontSize(10);
    doc.text(amountInWords(total), 20, y);

    doc.text("Thank you for your business!", 105, y + 20, { align: "center" });

    // Save / open PDF
    doc.save(`${invoiceNumber}.pdf`);

    // For thermal receipt (future: open a print-optimized view)
    setLastInvoiceNumber(invoiceNumber);
    setShowInvoice(true);

    // In real version: write transaction + stock movements to Firestore here
    // Then clear cart
    setTimeout(() => {
      setCart([]);
      setDiscount(0);
    }, 1200);
  };

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-semibold">
            {mode === "order" ? "New Order (Online)" : "New Sale"}
          </h1>
          <div className="text-sm text-gray-500">Demo • No real stock deduction yet</div>
        </div>

        <div className="grid md:grid-cols-5 gap-6">
          {/* Product picker */}
          <div className="md:col-span-3 bg-white rounded-2xl border p-4">
            <div className="font-medium mb-3">Products</div>
            <div className="grid grid-cols-2 gap-3">
              {demoProducts.map((p) => (
                <button
                  key={p.id}
                  onClick={() => addToCart(p)}
                  className="border rounded-xl p-4 text-left active:bg-gray-50 hover:bg-gray-50"
                >
                  <div className="font-medium">{p.name}</div>
                  <div className="text-sm text-gray-600">LKR {p.price}</div>
                </button>
              ))}
            </div>
            <p className="mt-4 text-xs text-gray-500">
              In real version this will search your products + support phone scanner.
            </p>
          </div>

          {/* Cart */}
          <div className="md:col-span-2 bg-white rounded-2xl border p-4 flex flex-col">
            <div className="font-medium mb-3">Current Cart</div>

            {cart.length === 0 && (
              <div className="text-gray-400 text-sm py-8 text-center">No items yet. Tap products on the left.</div>
            )}

            {cart.map((item) => (
              <div key={item.id} className="flex items-center justify-between py-2 border-b last:border-b-0">
                <div>
                  <div>{item.name}</div>
                  <div className="text-xs text-gray-500">LKR {item.price} × {item.qty}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => updateQty(item.id, item.qty - 1)} className="px-2">-</button>
                  <span className="w-6 text-center">{item.qty}</span>
                  <button onClick={() => updateQty(item.id, item.qty + 1)} className="px-2">+</button>
                  <button onClick={() => removeItem(item.id)} className="text-red-500 ml-2">×</button>
                </div>
              </div>
            ))}

            <div className="mt-auto pt-4 space-y-3">
              <div className="flex justify-between text-sm">
                <span>Subtotal</span>
                <span>LKR {subtotal}</span>
              </div>

              <div className="flex items-center gap-2 text-sm">
                <span>Discount</span>
                <input
                  type="number"
                  value={discount}
                  onChange={(e) => setDiscount(Math.max(0, parseInt(e.target.value) || 0))}
                  className="w-24 border rounded px-2 py-1 text-right"
                />
              </div>

              <div className="flex justify-between font-semibold text-lg border-t pt-2">
                <span>Total</span>
                <span>LKR {total}</span>
              </div>

              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as any)}
                className="w-full border rounded-xl px-3 py-2"
              >
                <option value="Cash">Cash</option>
                <option value="Card">Card</option>
                <option value="Transfer">Bank Transfer</option>
              </select>

              {mode === "order" && (
                <input
                  placeholder="Customer name / phone (optional)"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full border rounded-xl px-3 py-2"
                />
              )}

              <button
                onClick={completeSale}
                disabled={cart.length === 0}
                className="btn-large w-full bg-emerald-600 text-white rounded-2xl font-medium disabled:opacity-50"
              >
                Complete {mode === "order" ? "Order" : "Sale"} & Generate TAX INVOICE
              </button>
            </div>
          </div>
        </div>

        {/* Invoice success modal */}
        {showInvoice && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl p-6 max-w-md w-full">
              <h3 className="font-semibold text-lg">TAX INVOICE Generated</h3>
              <p className="mt-1">Invoice #{lastInvoiceNumber} has been downloaded as PDF.</p>

              <div className="mt-4 flex gap-3">
                <button
                  onClick={() => {
                    setShowInvoice(false);
                  }}
                  className="flex-1 py-3 rounded-xl border"
                >
                  Close
                </button>
                <button
                  onClick={() => {
                    // In future: open a dedicated narrow receipt print view
                    alert("Thermal receipt print view would open here (80mm optimized)");
                  }}
                  className="flex-1 py-3 rounded-xl bg-black text-white"
                >
                  Print Receipt (Thermal)
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

export default function NewSalePage() {
  return (
    <Suspense fallback={<div className="p-8">Loading sale screen...</div>}>
      <SaleContent />
    </Suspense>
  );
}
