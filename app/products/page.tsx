"use client";

import AppLayout from "@/components/AppLayout";
import { useState, useEffect, useRef } from "react";
import { Plus, Search, Edit2, Trash2, Scan } from "lucide-react";
import { Html5Qrcode } from "html5-qrcode";
import { useAuth } from "@/lib/auth-context";
import { Product } from "@/lib/types";
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  deleteField,
  limit,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { toast } from "sonner";

export default function ProductsPage() {
  const { organization, user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [listRetry, setListRetry] = useState(0);
  const [showAdd, setShowAdd] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // Form state for add/edit
  const [form, setForm] = useState({
    name: "",
    price: "",
    stock: "",
    barcode: "",
    imageUrl: "",
  });

  // Local "Add with Scanner" modal state (instant/same-device path)
  const [showScannerAdd, setShowScannerAdd] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [lastScanned, setLastScanned] = useState<string | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scannerContainerId = "add-product-scanner";
  // Shared with intent listener for cross-device dedup
  const handledIntentIds = useRef(new Set<string>());
  // Latest products for the intent listener (avoids stale closure without re-subscribing on every list change)
  const productsRef = useRef<Product[]>([]);

  // Real-time products for this organization
  useEffect(() => {
    if (!organization) {
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, "products"),
      where("organizationId", "==", organization.id),
      orderBy("name")
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: Product[] = snapshot.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Product, "id">),
        }));
        setProducts(list);
        productsRef.current = list;
        setLoadError(null);
        setLoading(false);
      },
      (error) => {
        console.error("Products snapshot error:", error);
        const code = error?.code || "";
        const msg = (error?.message || "").toLowerCase();
        let friendly = "Failed to load products. Check your connection or permissions.";
        if (code === "failed-precondition" || msg.includes("index")) {
          friendly = "Missing Firestore index. Deploy with: firebase deploy --only firestore:indexes (or use the link shown in the browser console).";
        } else if (code === "permission-denied") {
          friendly = "Permission denied. Deploy rules + indexes, then refresh (see docs/firebase-setup.md).";
        }
        setLoadError(friendly);
        toast.error(friendly);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [organization, listRetry]);

  // Camera cleanup for the Add-with-Scanner modal (prevents leaks on unmount / route change)
  useEffect(() => {
    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
      }
    };
  }, []);

  // Also stop scanner when the scanner modal is closed externally
  useEffect(() => {
    if (!showScannerAdd && scannerRef.current) {
      scannerRef.current.stop().catch(() => {});
      scannerRef.current = null;
      setIsScanning(false);
    }
  }, [showScannerAdd]);

  // Lightweight cross-device signaling listener (hybrid: phone scanner → this desktop opens the prefilled Add form)
  // Follows the same "simplest realtime" pattern described in docs/tech-architecture.md for carts.
  useEffect(() => {
    if (!organization) return;

    const intentQuery = query(
      collection(db, "productAddIntents"),
      where("organizationId", "==", organization.id),
      orderBy("createdAt", "desc"),
      limit(8)
    );

    const unsubscribeIntents = onSnapshot(
      intentQuery,
      (snap) => {
        snap.docChanges().forEach((change) => {
          if (change.type !== "added" && change.type !== "modified") return;

          const id = change.doc.id;
          if (handledIntentIds.current.has(id)) return;

          const data = change.doc.data() as any;
          const bc = (data?.barcode || "").toString().trim();
          if (!bc) {
            // Malformed — consume it
            deleteDoc(doc(db, "productAddIntents", id)).catch(() => {});
            handledIntentIds.current.add(id);
            return;
          }

          // Use the ref so we see the freshest list even if this callback closed over an older render
          const currentProducts = productsRef.current.length ? productsRef.current : products;
          const alreadyExists = currentProducts.some(
            (p) => p.barcode && p.barcode.trim() === bc
          );

          if (alreadyExists) {
            deleteDoc(doc(db, "productAddIntents", id)).catch(() => {});
            handledIntentIds.current.add(id);
            return;
          }

          // This is new for the org — open the *exact same* Add Product modal the local scanner and manual button use
          handledIntentIds.current.add(id);
          resetForm();
          setForm((f) => ({ ...f, barcode: bc }));
          setShowAdd(true);

          // Consume immediately so other tabs / other desktops in the same org do not also pop the modal
          deleteDoc(doc(db, "productAddIntents", id)).catch(() => {});

          toast.info("New barcode from scanner — complete the product details");
        });
      },
      (err) => {
        // Non-fatal for the main products list; just log
        console.warn("productAddIntents listener error (non-fatal):", err);
      }
    );

    return () => unsubscribeIntents();
  }, [organization]);

  const filtered = products.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.barcode && p.barcode.toLowerCase().includes(search.toLowerCase()))
  );

  const resetForm = () => {
    setForm({ name: "", price: "", stock: "", barcode: "", imageUrl: "" });
    setEditingProduct(null);
  };

  const openAdd = () => {
    // Close scanner modal if it is open so the two modals never overlap
    if (showScannerAdd) closeScannerAdd();
    resetForm();
    setShowAdd(true);
  };

  const openEdit = (product: Product) => {
    setEditingProduct(product);
    setForm({
      name: product.name,
      price: String(product.price),
      stock: String(product.stock),
      barcode: product.barcode || "",
      imageUrl: product.imageUrl || "",
    });
    setShowAdd(true);
  };

  const closeModal = () => {
    setShowAdd(false);
    resetForm();
    // Also ensure scanner is not left running in background
    if (showScannerAdd) closeScannerAdd();
  };

  // --- Local scanner controls for "Add with Scanner" (reuses patterns from app/scanner/page.tsx) ---
  const openScannerAdd = () => {
    // Ensure we don't have the manual modal fighting with the scanner one
    if (showAdd) {
      setShowAdd(false);
      resetForm();
    }
    setLastScanned(null);
    setShowScannerAdd(true);
  };

  const startScannerForAdd = async () => {
    try {
      const html5QrCode = new Html5Qrcode(scannerContainerId);
      scannerRef.current = html5QrCode;

      await html5QrCode.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          setLastScanned(decodedText);
          html5QrCode.pause();
          handleScannedCode(decodedText);
        },
        (_errorMessage) => {
          // ignore continuous scan errors (same as scanner page)
        }
      );
      setIsScanning(true);
    } catch (err: any) {
      console.error("Camera start failed:", err);
      const msg = (err?.message || "").toLowerCase();
      if (msg.includes("permission") || msg.includes("denied") || msg.includes("not allowed")) {
        toast.error("Camera permission denied. Please allow camera access in your browser settings and try again.");
      } else if (msg.includes("not found") || msg.includes("no camera")) {
        toast.error("No camera found on this device.");
      } else if (window.location.protocol !== "https:" && window.location.hostname !== "localhost") {
        toast.error("Camera requires HTTPS. Please access over a secure connection.");
      } else {
        toast.error("Camera access failed. Please allow camera permission and ensure you're on HTTPS or localhost.");
      }
    }
  };

  const stopScannerForAdd = async () => {
    if (scannerRef.current) {
      await scannerRef.current.stop();
      scannerRef.current = null;
    }
    setIsScanning(false);
  };

  const closeScannerAdd = () => {
    stopScannerForAdd().catch(() => {});
    setShowScannerAdd(false);
    setIsScanning(false);
    setLastScanned(null);
  };

  const handleScannedCode = (code: string) => {
    const trimmed = code.trim();
    if (!trimmed) return;

    const existing = products.find(
      (p) => p.barcode && p.barcode.trim() === trimmed
    );
    if (existing) {
      toast.error(`Barcode already used by "${existing.name}"`);
      // Leave the scanner modal open/paused so the user can scan another item
      return;
    }

    // New barcode — transition to the *exact same* unchanged Add Product modal with barcode pre-filled
    resetForm();
    setForm((f) => ({ ...f, barcode: trimmed }));
    closeScannerAdd();
    setShowAdd(true);
  };

  // --- End local scanner controls ---

  const handleSaveProduct = async () => {
    if (!organization || !user) {
      toast.error("No organization loaded");
      return;
    }
    if (!form.name.trim()) {
      toast.error("Product name is required");
      return;
    }
    const price = parseFloat(form.price);
    const stock = parseInt(form.stock, 10);
    if (isNaN(price) || price < 0) {
      toast.error("Please enter a valid price");
      return;
    }
    if (isNaN(stock) || stock < 0) {
      toast.error("Please enter a valid stock quantity");
      return;
    }

    try {
      if (editingProduct) {
        // Update existing — use deleteField() for optional fields when cleared so we don't leave stale values
        const ref = doc(db, "products", editingProduct.id);
        const updateData: Record<string, any> = {
          name: form.name.trim(),
          price,
          stock,
          updatedAt: serverTimestamp(),
        };

        const barcodeVal = form.barcode.trim();
        if (barcodeVal) {
          updateData.barcode = barcodeVal;
        } else {
          updateData.barcode = deleteField();
        }

        const imageVal = form.imageUrl.trim();
        if (imageVal) {
          updateData.imageUrl = imageVal;
        } else {
          updateData.imageUrl = deleteField();
        }

        await updateDoc(ref, updateData);
        toast.success("Product updated");
      } else {
        // Create new — only include optional fields when they have a value (Firestore rejects undefined)
        const productData: Record<string, any> = {
          organizationId: organization.id,
          name: form.name.trim(),
          price,
          stock,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };

        const barcodeVal = form.barcode.trim();
        if (barcodeVal) productData.barcode = barcodeVal;

        const imageVal = form.imageUrl.trim();
        if (imageVal) productData.imageUrl = imageVal;

        await addDoc(collection(db, "products"), productData);
        toast.success("Product added");
      }
      closeModal();
    } catch (err: any) {
      console.error("Save product error:", err);
      const msg = (err?.message || "").toLowerCase();
      if (err?.code === "permission-denied") {
        toast.error("Permission denied. Make sure Firestore rules are deployed for production.");
      } else if (msg.includes("undefined") || msg.includes("unsupported field value") || msg.includes("invalid data")) {
        toast.error("Failed to save product: leave optional fields (Image URL, Barcode) completely empty if not using them.");
      } else {
        toast.error("Failed to save product");
      }
    }
  };

  const handleDelete = async (product: Product) => {
    if (!confirm(`Delete "${product.name}"? This cannot be undone.`)) return;

    try {
      await deleteDoc(doc(db, "products", product.id));
      toast.success("Product deleted");
    } catch (err: any) {
      console.error("Delete error:", err);
      toast.error("Failed to delete product");
    }
  };

  if (!organization) {
    return (
      <AppLayout>
        <div className="p-8 text-center text-gray-500">
          Loading your organization... If this persists, check Firestore rules.
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Products</h1>
        <button
          onClick={openAdd}
          className="btn-large flex items-center gap-2 bg-black text-white px-5 rounded-xl"
        >
          <Plus className="w-4 h-4" /> Add Product
        </button>
        {/* Second button — "Add with Scanner". The manual Add Product button above is left 100% unchanged. */}
        <button
          onClick={openScannerAdd}
          className="btn-large flex items-center gap-2 border px-5 rounded-xl"
        >
          <Scan className="w-4 h-4" /> Add with Scanner
        </button>
      </div>

      <div className="relative mb-4">
        <Search className="absolute left-4 top-3.5 text-gray-400 w-4 h-4" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name or barcode..."
          className="w-full pl-10 py-3 rounded-xl border"
        />
      </div>

      <div className="bg-white rounded-2xl border overflow-hidden">
        {loading && (
          <div className="p-8 text-center text-gray-500">Loading products...</div>
        )}
        {loadError && !loading && (
          <div className="p-8 text-center">
            <div className="text-red-600 font-medium mb-2">{loadError}</div>
            <div className="text-xs text-gray-500 mb-3">
              Adding/editing products may still work (writes don't need the sort index). 
              The live list will update once the index is ready.
            </div>
            <button
              onClick={() => setListRetry((r) => r + 1)}
              className="px-4 py-1.5 text-sm rounded-lg border hover:bg-gray-50"
            >
              Retry loading products list
            </button>
          </div>
        )}
        {!loading && !loadError && filtered.length === 0 && (
          <div className="p-8 text-center text-gray-500">
            {products.length === 0 ? "No products yet. Add your first one." : "No products match your search."}
          </div>
        )}
        {filtered.map((p) => (
          <div key={p.id} className="px-4 py-3 border-b last:border-b-0 flex items-center justify-between">
            <div>
              <div className="font-medium">{p.name}</div>
              <div className="text-xs text-gray-500">
                {p.barcode ? p.barcode : "No barcode"} • LKR {p.price}
                {p.imageUrl && <span className="ml-2 text-blue-600">• has image</span>}
              </div>
            </div>
            <div className="text-right flex items-center gap-3">
              <div className={p.stock < (organization.lowStockThreshold ?? 10) ? "text-red-600 font-medium" : ""}>
                {p.stock} in stock
              </div>
              <button
                onClick={() => openEdit(p)}
                className="text-blue-600 hover:text-blue-700"
                aria-label="Edit"
              >
                <Edit2 className="w-4 h-4" />
              </button>
              <button
                onClick={() => handleDelete(p)}
                className="text-red-500 hover:text-red-600"
                aria-label="Delete"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Add / Edit Product Modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center z-50">
          <div className="bg-white w-full md:w-[420px] rounded-t-2xl md:rounded-2xl p-6">
            <h3 className="font-semibold text-lg mb-4">
              {editingProduct ? "Edit Product" : "Add Product"}
            </h3>

            <div className="space-y-3">
              <input
                placeholder="Product name *"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full border rounded-xl px-4 py-3"
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  placeholder="Selling price (LKR) *"
                  type="number"
                  step="0.01"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                  className="border rounded-xl px-4 py-3"
                />
                <input
                  placeholder="Stock quantity *"
                  type="number"
                  value={form.stock}
                  onChange={(e) => setForm({ ...form, stock: e.target.value })}
                  className="border rounded-xl px-4 py-3"
                />
              </div>
              <input
                placeholder="Barcode (optional)"
                value={form.barcode}
                onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                className="w-full border rounded-xl px-4 py-3"
              />
              <input
                placeholder="Image URL (optional - use public link, no upload)"
                value={form.imageUrl}
                onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
                className="w-full border rounded-xl px-4 py-3"
              />
            </div>

            <div className="mt-6 flex gap-3">
              <button onClick={closeModal} className="flex-1 py-3 rounded-xl border">
                Cancel
              </button>
              <button
                onClick={handleSaveProduct}
                className="flex-1 py-3 rounded-xl bg-black text-white"
              >
                {editingProduct ? "Save Changes" : "Add Product"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dedicated "Add with Scanner" modal — local/instant path. Same visual style as the Add Product modal. */}
      {showScannerAdd && (
        <div className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center z-50">
          <div className="bg-white w-full md:w-[420px] rounded-t-2xl md:rounded-2xl p-6">
            <h3 className="font-semibold text-lg mb-2">Add with Scanner</h3>
            <p className="text-sm text-gray-600 mb-4">
              Scan a product barcode. If it is new, the normal Add Product form will open with the barcode already filled.
            </p>

            <div
              id={scannerContainerId}
              className="w-full bg-black rounded-2xl overflow-hidden aspect-square mb-4"
            />

            <div className="flex gap-3 mb-3">
              {!isScanning ? (
                <button
                  onClick={startScannerForAdd}
                  className="flex-1 btn-large bg-black text-white rounded-2xl"
                >
                  Start Camera
                </button>
              ) : (
                <button
                  onClick={stopScannerForAdd}
                  className="flex-1 btn-large border rounded-2xl"
                >
                  Stop Camera
                </button>
              )}
              <button onClick={closeScannerAdd} className="flex-1 py-3 rounded-2xl border">
                Cancel
              </button>
            </div>

            {lastScanned && (
              <div className="text-xs text-gray-500">
                Last scanned: <span className="font-mono">{lastScanned}</span>
              </div>
            )}

            <div className="mt-4 text-[11px] text-gray-500">
              Tip: Use the same account on phone + desktop for the hybrid experience (phone camera feeds the desktop Products screen).
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
