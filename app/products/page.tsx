"use client";

import AppLayout from "@/components/AppLayout";
import { useState, useEffect } from "react";
import { Plus, Search, Edit2, Trash2 } from "lucide-react";
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
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { toast } from "sonner";

export default function ProductsPage() {
  const { organization, user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
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
        setLoading(false);
      },
      (error) => {
        console.error("Products snapshot error:", error);
        toast.error("Failed to load products. Check your connection or permissions.");
        setLoading(false);
      }
    );

    return () => unsubscribe();
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
  };

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
        // Update existing
        const ref = doc(db, "products", editingProduct.id);
        await updateDoc(ref, {
          name: form.name.trim(),
          price,
          stock,
          barcode: form.barcode.trim() || undefined,
          imageUrl: form.imageUrl.trim() || undefined,
          updatedAt: serverTimestamp(),
        });
        toast.success("Product updated");
      } else {
        // Create new
        await addDoc(collection(db, "products"), {
          organizationId: organization.id,
          name: form.name.trim(),
          price,
          stock,
          barcode: form.barcode.trim() || undefined,
          imageUrl: form.imageUrl.trim() || undefined,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        toast.success("Product added");
      }
      closeModal();
    } catch (err: any) {
      console.error("Save product error:", err);
      if (err?.code === "permission-denied") {
        toast.error("Permission denied. Make sure Firestore rules are deployed for production.");
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
        {!loading && filtered.length === 0 && (
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
    </AppLayout>
  );
}
