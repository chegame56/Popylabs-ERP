"use client";

import AppLayout from "@/components/AppLayout";
import { useSearchParams } from "next/navigation";
import { useState, Suspense, useEffect } from "react";
import { generateInvoiceNumber, computeInvoiceTotals } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { Product } from "@/lib/types";
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  runTransaction,
  doc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { toast } from "sonner";
import { generateProfessionalPDF, printThermalReceipt, generateWhatsAppText } from "@/lib/invoice";

interface CartItem {
  id: string;
  name: string;
  price: number;
  qty: number;
}

function SaleContent() {
  const searchParams = useSearchParams();
  const mode = searchParams.get("mode") === "order" ? "order" : "sale";
  const { organization, user } = useAuth();

  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [discount, setDiscount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<"Cash" | "Card" | "Bank Transfer" | "COD" | "Other">("Cash");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [showInvoice, setShowInvoice] = useState(false);
  const [lastInvoiceNumber, setLastInvoiceNumber] = useState("");
  const [lastTxnForActions, setLastTxnForActions] = useState<any>(null); // snapshot for re-print / copy after close
  const [completing, setCompleting] = useState(false);

  // Load real products for this organization (live)
  useEffect(() => {
    if (!organization) {
      setProductsLoading(false);
      return;
    }
    const q = query(
      collection(db, "products"),
      where("organizationId", "==", organization.id),
      orderBy("name")
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: Product[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
        setProducts(list);
        setProductsLoading(false);
      },
      (err) => {
        console.error("Sale products load error:", err);
        const code = err?.code || "";
        const msg = (err?.message || "").toLowerCase();
        if (code === "failed-precondition" || msg.includes("index")) {
          toast.error("Missing Firestore index. Deploy indexes: firebase deploy --only firestore:indexes");
        } else if (code === "permission-denied") {
          toast.error("Permission denied loading products. Deploy the rules.");
        } else {
          toast.error("Could not load your products");
        }
        setProductsLoading(false);
      }
    );
    return () => unsub();
  }, [organization]);

  const subtotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  const vatRate = organization?.defaultVatRate ?? 18;
  const totals = computeInvoiceTotals(subtotal, discount, vatRate);
  const grandTotal = totals.grandTotal;

  const addToCart = (product: Product) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.id === product.id);
      if (existing) {
        return prev.map((i) =>
          i.id === product.id ? { ...i, qty: i.qty + 1 } : i
        );
      }
      return [...prev, { id: product.id, name: product.name, price: product.price, qty: 1 }];
    });
  };

  const updateQty = (id: string, newQty: number) => {
    if (newQty < 1) return;
    setCart((prev) => prev.map((i) => (i.id === id ? { ...i, qty: newQty } : i)));
  };

  const removeItem = (id: string) => {
    setCart((prev) => prev.filter((i) => i.id !== id));
  };

  const completeSale = async () => {
    if (cart.length === 0 || !organization || !user) return;

    setCompleting(true);

    // Capture a trimmed customer name at completion time (used for both the immutable txn record and the PDF).
    // We trim here so a field of only whitespace is treated as "not provided".
    const trimmedCustomer = (customerName || "").trim();

    try {
      // Use a Firestore transaction for atomicity:
      // - Read current org sequence
      // - Decrement stock for each line item (with stock check)
      // - Create transaction record
      // - Increment nextInvoiceSequence on the org
      const result = await runTransaction(db, async (transaction) => {
        // 1. Read org for sequence + prefix
        const orgRef = doc(db, "organizations", organization.id);
        const orgSnap = await transaction.get(orgRef);
        if (!orgSnap.exists()) throw new Error("Organization not found");

        const orgData = orgSnap.data() as any;
        const prefix = orgData.invoicePrefix || "INV-";
        const currentSeq = orgData.nextInvoiceSequence || 1;

        const invoiceNumber = generateInvoiceNumber(prefix, currentSeq);

        // 2. Read + validate + prepare stock updates for every cart item
        const productRefsAndUpdates: Array<{ ref: any; newStock: number; item: CartItem }> = [];

        for (const cartItem of cart) {
          const prodRef = doc(db, "products", cartItem.id);
          const prodSnap = await transaction.get(prodRef);

          if (!prodSnap.exists()) {
            throw new Error(`Product "${cartItem.name}" no longer exists`);
          }

          const prodData = prodSnap.data() as any;
          if (prodData.organizationId !== organization.id) {
            throw new Error("Product does not belong to your organization");
          }

          const currentStock: number = prodData.stock ?? 0;
          if (currentStock < cartItem.qty) {
            throw new Error(`Not enough stock for "${cartItem.name}" (have ${currentStock})`);
          }

          productRefsAndUpdates.push({
            ref: prodRef,
            newStock: currentStock - cartItem.qty,
            item: cartItem,
          });
        }

        // 3. Apply stock decrements
        for (const u of productRefsAndUpdates) {
          transaction.update(u.ref, { stock: u.newStock, updatedAt: serverTimestamp() });
        }

        // 4. Create the transaction record
        const txnRef = doc(collection(db, "transactions")); // auto id

        // Build txnData without any undefined values. Only include customerName (for orders) when it has a real trimmed value.
        // Passing undefined (or a key with undefined) to Transaction.set() throws "Unsupported field value: undefined".
        const placeOfSupply = organization.address || "Sri Lanka";

        const txnDataForStore = {
          organizationId: organization.id,
          type: mode,
          invoiceNumber,
          items: cart.map((c) => ({
            productId: c.id,
            name: c.name,
            price: c.price,
            qty: c.qty,
          })),
          subtotal: totals.subtotal,
          discount: totals.discount,
          vatRate: totals.vatRate,
          vatAmount: totals.vatAmount,
          taxableValue: totals.taxableValue,
          grandTotal: totals.grandTotal,
          total: totals.grandTotal, // legacy alias
          paymentMethod,
          createdAt: serverTimestamp(),
          createdByUid: user.uid,
          placeOfSupply,
          ...(mode === "order" && trimmedCustomer ? { customerName: trimmedCustomer } : {}),
          ...(mode === "order" && customerPhone.trim() ? { customerPhone: customerPhone.trim() } : {}),
          ...(mode === "order" ? { source: "Other" } : {}),
        };

        transaction.set(txnRef, txnDataForStore);

        // 5. Advance the invoice sequence on the org
        transaction.update(orgRef, {
          nextInvoiceSequence: currentSeq + 1,
        });

        return { invoiceNumber, txnId: txnRef.id, txnDataForStore };
      });

      // Success — generate the full IRD-compliant professional PDF
      const invoiceNumber = result.invoiceNumber;
      const txnSnapshot = {
        ...result.txnDataForStore,
        invoiceNumber,
        createdAt: new Date(), // for immediate render before serverTimestamp resolves
      };

      // Use the shared compliant generator (dual output ready)
      generateProfessionalPDF(organization, txnSnapshot);

      // Prepare snapshot for post-sale actions (thermal + copy)
      const actionSnapshot = { ...txnSnapshot, organizationId: organization.id };
      setLastTxnForActions(actionSnapshot);

      setLastInvoiceNumber(invoiceNumber);
      setShowInvoice(true);

      // Clear cart + state on success
      setCart([]);
      setDiscount(0);
      setCustomerName("");
      setCustomerPhone("");

      toast.success(`Sale recorded • ${invoiceNumber}`);
    } catch (err: any) {
      console.error("Complete sale transaction error:", err);
      const msg = err?.message || "Failed to complete sale. Please try again.";
      toast.error(msg.length > 120 ? msg.slice(0, 117) + "..." : msg);
    } finally {
      setCompleting(false);
    }
  };

  const lowStockThreshold = organization?.lowStockThreshold ?? 10;

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-semibold">
            {mode === "order" ? "New Order (Online)" : "New Sale"}
          </h1>
          <div className="text-sm text-gray-500">
            {organization ? organization.legalName : "Loading..."}
          </div>
        </div>

        <div className="grid md:grid-cols-5 gap-6">
          {/* Product picker (real data) */}
          <div className="md:col-span-3 bg-white rounded-2xl border p-4">
            <div className="font-medium mb-3 flex items-center justify-between">
              <span>Products</span>
              {productsLoading && <span className="text-xs text-gray-400">loading…</span>}
            </div>

            {products.length === 0 && !productsLoading && (
              <p className="text-sm text-gray-500 py-4">
                No products yet. Go to <a href="/products" className="underline">Products</a> to add some.
              </p>
            )}

            <div className="grid grid-cols-2 gap-3">
              {products.map((p) => {
                const low = p.stock < lowStockThreshold;
                return (
                  <button
                    key={p.id}
                    onClick={() => addToCart(p)}
                    disabled={p.stock <= 0}
                    className="border rounded-xl p-4 text-left active:bg-gray-50 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <div className="font-medium">{p.name}</div>
                    <div className="text-sm text-gray-600">LKR {p.price}</div>
                    <div className={`text-xs mt-0.5 ${low ? "text-red-600" : "text-gray-500"}`}>
                      {p.stock} in stock {low && "• low"}
                    </div>
                  </button>
                );
              })}
            </div>

            <p className="mt-4 text-xs text-gray-500">
              Stock is deducted in real time when you complete a sale.
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
                <span>LKR {totals.subtotal}</span>
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

              <div className="flex justify-between text-sm">
                <span>Taxable Value</span>
                <span>LKR {totals.taxableValue}</span>
              </div>

              <div className="flex justify-between text-sm">
                <span>VAT @ {totals.vatRate}%</span>
                <span>LKR {totals.vatAmount}</span>
              </div>

              <div className="flex justify-between font-semibold text-lg border-t pt-2">
                <span>Total (incl. VAT)</span>
                <span>LKR {grandTotal}</span>
              </div>

              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as any)}
                className="w-full border rounded-xl px-3 py-2"
              >
                <option value="Cash">Cash</option>
                <option value="Card">Card</option>
                <option value="Bank Transfer">Bank Transfer</option>
                <option value="COD">COD</option>
                <option value="Other">Other</option>
              </select>

              {mode === "order" && (
                <>
                  <input
                    placeholder="Customer name (optional)"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="w-full border rounded-xl px-3 py-2"
                  />
                  <input
                    placeholder="Customer phone (optional)"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    className="w-full border rounded-xl px-3 py-2"
                  />
                </>
              )}

              <button
                onClick={completeSale}
                disabled={cart.length === 0 || completing || !organization}
                className="btn-large w-full bg-emerald-600 text-white rounded-2xl font-medium disabled:opacity-50"
              >
                {completing ? "Recording sale..." : `Complete ${mode === "order" ? "Order" : "Sale"} & Generate TAX INVOICE`}
              </button>
            </div>
          </div>
        </div>

        {/* Invoice success modal — Dual output: Professional PDF (already downloaded) + Thermal + Share */}
        {showInvoice && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl p-6 max-w-md w-full">
              <h3 className="font-semibold text-lg">TAX INVOICE Generated</h3>
              <p className="mt-1 font-mono text-sm">#{lastInvoiceNumber}</p>
              <p className="text-xs text-gray-500 mt-1">Professional PDF downloaded. Stock updated. Full IRD-compliant record saved.</p>

              <div className="mt-4 grid grid-cols-1 gap-2">
                <button
                  onClick={() => {
                    setShowInvoice(false);
                    setLastTxnForActions(null);
                  }}
                  className="w-full py-3 rounded-xl border"
                >
                  Close
                </button>

                <button
                  onClick={() => {
                    if (lastTxnForActions && organization) {
                      generateProfessionalPDF(organization, lastTxnForActions);
                    } else {
                      toast.error("No invoice data for re-download");
                    }
                  }}
                  className="w-full py-3 rounded-xl border border-emerald-600 text-emerald-700"
                >
                  Download PDF Again
                </button>

                <button
                  onClick={() => {
                    if (lastTxnForActions && organization) {
                      printThermalReceipt(organization, lastTxnForActions);
                    } else {
                      toast.error("No invoice data for thermal print");
                    }
                  }}
                  className="w-full py-3 rounded-xl bg-black text-white"
                >
                  Print Thermal Receipt (80mm)
                </button>

                <button
                  onClick={() => {
                    if (lastTxnForActions && organization) {
                      const text = generateWhatsAppText(organization, lastTxnForActions);
                      navigator.clipboard.writeText(text).then(() => {
                        toast.success("Copied to clipboard — paste into WhatsApp");
                      }).catch(() => {
                        // Fallback
                        alert(text);
                      });
                    }
                  }}
                  className="w-full py-3 rounded-xl border"
                >
                  Copy for WhatsApp / Text
                </button>
              </div>

              <p className="mt-3 text-[10px] text-center text-gray-400">
                Both PDF (detailed, for records/accountant) and Thermal (counter printer) are IRD Gazette compliant.
              </p>
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
