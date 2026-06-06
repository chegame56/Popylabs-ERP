"use client";

import AppLayout from "@/components/AppLayout";
import { useSearchParams } from "next/navigation";
import { useState, Suspense, useEffect } from "react";
import jsPDF from "jspdf";
import { amountInWords, generateInvoiceNumber } from "@/lib/utils";
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
  const [paymentMethod, setPaymentMethod] = useState<"Cash" | "Card" | "Transfer">("Cash");
  const [customerName, setCustomerName] = useState("");
  const [showInvoice, setShowInvoice] = useState(false);
  const [lastInvoiceNumber, setLastInvoiceNumber] = useState("");
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
        toast.error("Could not load your products");
        setProductsLoading(false);
      }
    );
    return () => unsub();
  }, [organization]);

  const subtotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  const total = Math.max(0, subtotal - discount);

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
        const txnData = {
          organizationId: organization.id,
          type: mode,
          invoiceNumber,
          items: cart.map((c) => ({
            productId: c.id,
            name: c.name,
            price: c.price,
            qty: c.qty,
          })),
          subtotal,
          discount,
          total,
          paymentMethod,
          customerName: mode === "order" ? (customerName.trim() || undefined) : undefined,
          createdAt: serverTimestamp(),
          createdByUid: user.uid,
        };
        transaction.set(txnRef, txnData);

        // 5. Advance the invoice sequence on the org
        transaction.update(orgRef, {
          nextInvoiceSequence: currentSeq + 1,
        });

        return { invoiceNumber, txnId: txnRef.id };
      });

      // Success — generate the PDF using real data
      const invoiceNumber = result.invoiceNumber;

      const docPdf = new jsPDF();
      docPdf.setFontSize(16);
      docPdf.text("TAX INVOICE", 105, 20, { align: "center" });

      docPdf.setFontSize(11);
      docPdf.text(organization.legalName || "Your Business", 20, 32);
      if (organization.tin) docPdf.text(`TIN: ${organization.tin}`, 20, 38);
      docPdf.text(`Invoice No: ${invoiceNumber}`, 20, 44);
      docPdf.text(`Date: ${new Date().toLocaleDateString()}`, 20, 50);
      docPdf.text(`Payment: ${paymentMethod}`, 20, 56);

      if (mode === "order" && customerName) {
        docPdf.text(`Customer: ${customerName}`, 20, 62);
      }

      // Items
      let y = 72;
      docPdf.setFontSize(10);
      cart.forEach((item) => {
        docPdf.text(`${item.name} x${item.qty}`, 20, y);
        docPdf.text(`LKR ${(item.price * item.qty).toFixed(0)}`, 160, y, { align: "right" });
        y += 7;
      });

      y += 4;
      docPdf.text(`Subtotal: LKR ${subtotal}`, 160, y, { align: "right" });
      y += 7;
      if (discount > 0) docPdf.text(`Discount: LKR ${discount}`, 160, y, { align: "right" });
      y += 7;
      docPdf.setFontSize(12);
      docPdf.text(`TOTAL: LKR ${total}`, 160, y, { align: "right" });

      y += 10;
      docPdf.setFontSize(10);
      docPdf.text(amountInWords(total), 20, y);

      docPdf.text("Thank you for your business!", 105, y + 20, { align: "center" });

      docPdf.save(`${invoiceNumber}.pdf`);

      setLastInvoiceNumber(invoiceNumber);
      setShowInvoice(true);

      // Clear cart + state on success
      setCart([]);
      setDiscount(0);
      setCustomerName("");

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
                disabled={cart.length === 0 || completing || !organization}
                className="btn-large w-full bg-emerald-600 text-white rounded-2xl font-medium disabled:opacity-50"
              >
                {completing ? "Recording sale..." : `Complete ${mode === "order" ? "Order" : "Sale"} & Generate TAX INVOICE`}
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
              <p className="text-xs text-gray-500 mt-1">Stock has been updated in your inventory.</p>

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
