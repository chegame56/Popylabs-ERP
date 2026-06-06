"use client";

import AppLayout from "@/components/AppLayout";
import { useState } from "react";
import { Plus, Search } from "lucide-react";

interface Product {
  id: string;
  name: string;
  price: number;
  stock: number;
  barcode?: string;
}

const demoProducts: Product[] = [
  { id: "p1", name: "Coca Cola 1L", price: 280, stock: 42, barcode: "5449000000996" },
  { id: "p2", name: "White Bread", price: 120, stock: 8, barcode: "5010044000003" },
  { id: "p3", name: "Eggs (10 pack)", price: 380, stock: 3, barcode: "" },
  { id: "p4", name: "Rice 1kg", price: 220, stock: 65, barcode: "" },
];

export default function ProductsPage() {
  const [products, setProducts] = useState(demoProducts);
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);

  const filtered = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.barcode && p.barcode.includes(search))
  );

  return (
    <AppLayout>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Products</h1>
        <button
          onClick={() => setShowAdd(true)}
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
        {filtered.length === 0 && (
          <div className="p-8 text-center text-gray-500">No products found.</div>
        )}
        {filtered.map((p) => (
          <div key={p.id} className="px-4 py-3 border-b last:border-b-0 flex items-center justify-between">
            <div>
              <div className="font-medium">{p.name}</div>
              <div className="text-xs text-gray-500">
                {p.barcode ? p.barcode : "No barcode"} • LKR {p.price}
              </div>
            </div>
            <div className="text-right">
              <div className={p.stock < 10 ? "text-red-600 font-medium" : ""}>
                {p.stock} in stock
              </div>
              <button className="text-xs text-blue-600">Edit</button>
            </div>
          </div>
        ))}
      </div>

      {/* Add Product Modal (very basic for now) */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center z-50">
          <div className="bg-white w-full md:w-[420px] rounded-t-2xl md:rounded-2xl p-6">
            <h3 className="font-semibold text-lg mb-4">Add Product</h3>

            <div className="space-y-3">
              <input placeholder="Product name" className="w-full border rounded-xl px-4 py-3" />
              <div className="grid grid-cols-2 gap-3">
                <input placeholder="Selling price" type="number" className="border rounded-xl px-4 py-3" />
                <input placeholder="Stock qty" type="number" className="border rounded-xl px-4 py-3" />
              </div>
              <input placeholder="Barcode (optional)" className="w-full border rounded-xl px-4 py-3" />
            </div>

            <div className="mt-6 flex gap-3">
              <button onClick={() => setShowAdd(false)} className="flex-1 py-3 rounded-xl border">Cancel</button>
              <button
                onClick={() => {
                  // In real version: write to Firestore
                  setShowAdd(false);
                  alert("Product added (demo)");
                }}
                className="flex-1 py-3 rounded-xl bg-black text-white"
              >
                Save Product
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
