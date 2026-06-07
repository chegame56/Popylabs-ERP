"use client";

import AppLayout from "@/components/AppLayout";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Package, TrendingUp, AlertTriangle } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { collection, query, where, orderBy, limit, onSnapshot, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Transaction, Product } from "@/lib/types";

export default function Dashboard() {
  const { organization } = useAuth();

  const [todayTotal, setTodayTotal] = useState(0);
  const [todayCount, setTodayCount] = useState(0);
  const [lowStockCount, setLowStockCount] = useState(0);
  const [recent, setRecent] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  const businessName = organization?.legalName || "there";
  const threshold = organization?.lowStockThreshold ?? 10;

  // Load real stats + recent activity for the org
  useEffect(() => {
    if (!organization) {
      setLoading(false);
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Recent transactions (last 5)
    const recentQ = query(
      collection(db, "transactions"),
      where("organizationId", "==", organization.id),
      orderBy("createdAt", "desc"),
      limit(5)
    );

    const unsubRecent = onSnapshot(
      recentQ,
      (snap) => {
        const txns: Transaction[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
        setRecent(txns);

        // Very rough "today" calculation from the recent snapshot (good enough for v1 dashboard)
        let total = 0;
        let count = 0;
        const startOfDay = today.getTime();
        txns.forEach((t) => {
          const ts = t.createdAt?.toDate?.().getTime?.() || 0;
          if (ts >= startOfDay) {
            total += (t.grandTotal ?? t.total) || 0;
            count += 1;
          }
        });
        setTodayTotal(total);
        setTodayCount(count);
      },
      (err) => {
        console.error("Dashboard recent transactions error:", err);
        // Non-fatal for dashboard; the list just stays empty
      }
    );

    // Low stock count (one-time query is fine here)
    const loadLowStock = async () => {
      try {
        const prodQ = query(
          collection(db, "products"),
          where("organizationId", "==", organization.id)
        );
        const prodSnap = await getDocs(prodQ);
        let low = 0;
        prodSnap.forEach((d) => {
          const p = d.data() as Product;
          if ((p.stock ?? 0) < threshold) low++;
        });
        setLowStockCount(low);
      } catch (e) {
        // non-fatal
      } finally {
        setLoading(false);
      }
    };
    loadLowStock();

    return () => unsubRecent();
  }, [organization, threshold]);

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Good afternoon, {businessName.split(" ")[0]}!</h1>
          <p className="text-gray-500">Here’s what’s happening with your business today.</p>
        </div>

        {/* Today's Summary (real-backed) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-2xl p-5 border">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <TrendingUp className="w-4 h-4" /> Today’s Sales
            </div>
            <div className="mt-2 text-3xl font-semibold">LKR {todayTotal.toLocaleString()}</div>
            <div className="text-sm text-green-600 mt-1">+{todayCount} transactions</div>
          </div>

          <Link href="/history" className="bg-white rounded-2xl p-5 border hover:border-gray-300 transition block">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Package className="w-4 h-4" /> Recent Activity
            </div>
            <div className="mt-2 text-3xl font-semibold">{recent.length}</div>
            <div className="text-sm text-gray-500 mt-1">Last transactions • View all</div>
          </Link>

          <Link href="/products" className="bg-white rounded-2xl p-5 border hover:border-red-200 transition block">
            <div className="flex items-center gap-2 text-sm text-red-600">
              <AlertTriangle className="w-4 h-4" /> Low Stock Alert
            </div>
            <div className="mt-2 text-3xl font-semibold text-red-600">{lowStockCount} items</div>
            <div className="text-sm text-gray-500 mt-1">Tap to review products</div>
          </Link>
        </div>

        {/* Quick Actions */}
        <div>
          <h2 className="font-medium mb-3">Quick actions</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Link href="/sale" className="btn-large bg-white border rounded-2xl p-4 hover:bg-gray-50 flex flex-col items-start">
              <span className="font-medium">New Sale</span>
              <span className="text-xs text-gray-500">Counter / physical shop</span>
            </Link>
            <Link href="/sale?mode=order" className="btn-large bg-white border rounded-2xl p-4 hover:bg-gray-50 flex flex-col items-start">
              <span className="font-medium">New Order</span>
              <span className="text-xs text-gray-500">Instagram / FB / WhatsApp</span>
            </Link>
            <Link href="/scanner" className="btn-large bg-white border rounded-2xl p-4 hover:bg-gray-50 flex flex-col items-start">
              <span className="font-medium">Scan Products</span>
              <span className="text-xs text-gray-500">Use phone camera</span>
            </Link>
            <Link href="/products" className="btn-large bg-white border rounded-2xl p-4 hover:bg-gray-50 flex flex-col items-start">
              <span className="font-medium">Manage Products</span>
              <span className="text-xs text-gray-500">Add, edit, stock</span>
            </Link>
          </div>
        </div>

        {/* Recent Activity (real data) */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-medium">Recent activity</h2>
            <Link href="/history" className="text-xs text-blue-600">View all →</Link>
          </div>
          <div className="bg-white rounded-2xl border divide-y">
            {recent.length === 0 && !loading && (
              <div className="px-4 py-6 text-sm text-gray-500 text-center">No sales yet today.</div>
            )}
            {recent.map((t) => (
              <div key={t.id} className="px-4 py-3 flex justify-between text-sm">
                <div>
                  {t.invoiceNumber} • {t.type === "order" ? "Order" : "Sale"}
                  {t.customerName ? ` • ${t.customerName}` : ""}
                </div>
                <div className="font-medium">LKR {t.grandTotal ?? t.total}</div>
              </div>
            ))}
            {loading && recent.length === 0 && (
              <div className="px-4 py-3 text-sm text-gray-400">Loading recent activity...</div>
            )}
          </div>
        </div>

        {/* Evening Summary teaser */}
        <div className="bg-white border rounded-2xl p-5">
          <div className="font-medium">Evening Summary</div>
          <p className="text-sm text-gray-600 mt-1">
            At the end of the day your totals, best sellers, and low stock will appear here (powered by your real transaction data).
          </p>
        </div>
      </div>
    </AppLayout>
  );
}
