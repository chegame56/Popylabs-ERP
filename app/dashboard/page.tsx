"use client";

import AppLayout from "@/components/AppLayout";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Package, TrendingUp, AlertTriangle } from "lucide-react";

export default function Dashboard() {
  const [todaySales, setTodaySales] = useState(12450);
  const [todayOrders, setTodayOrders] = useState(18);
  const [lowStockCount, setLowStockCount] = useState(4);

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Good afternoon!</h1>
          <p className="text-gray-500">Here’s what’s happening with your business today.</p>
        </div>

        {/* Today's Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-2xl p-5 border">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <TrendingUp className="w-4 h-4" /> Today’s Sales
            </div>
            <div className="mt-2 text-3xl font-semibold">LKR {todaySales.toLocaleString()}</div>
            <div className="text-sm text-green-600 mt-1">+{todayOrders} transactions</div>
          </div>

          <div className="bg-white rounded-2xl p-5 border">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Package className="w-4 h-4" /> Orders Today
            </div>
            <div className="mt-2 text-3xl font-semibold">{todayOrders}</div>
            <div className="text-sm text-gray-500 mt-1">8 sales • 10 online orders</div>
          </div>

          <Link href="/products?filter=low" className="bg-white rounded-2xl p-5 border hover:border-red-200 transition block">
            <div className="flex items-center gap-2 text-sm text-red-600">
              <AlertTriangle className="w-4 h-4" /> Low Stock Alert
            </div>
            <div className="mt-2 text-3xl font-semibold text-red-600">{lowStockCount} items</div>
            <div className="text-sm text-gray-500 mt-1">Tap to review</div>
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

        {/* Recent Activity (demo) */}
        <div>
          <h2 className="font-medium mb-3">Recent activity</h2>
          <div className="bg-white rounded-2xl border divide-y">
            {[1, 2, 3].map((i) => (
              <div key={i} className="px-4 py-3 flex justify-between text-sm">
                <div>
                  Sale #{1000 + i} • Cash
                </div>
                <div className="font-medium">LKR {(2450 + i * 120).toLocaleString()}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Evening Summary teaser */}
        <div className="bg-white border rounded-2xl p-5">
          <div className="font-medium">Evening Summary</div>
          <p className="text-sm text-gray-600 mt-1">
            At the end of the day you’ll see total sales, best sellers, and low stock items here.
          </p>
          <button className="mt-3 text-sm underline">View today’s full summary (demo)</button>
        </div>
      </div>
    </AppLayout>
  );
}
