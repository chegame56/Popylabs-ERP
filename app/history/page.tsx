"use client";

import AppLayout from "@/components/AppLayout";
import Link from "next/link";

const demoHistory = [
  { id: "TXN-1003", date: "Today 14:22", total: 3450, type: "Sale", invoice: "INV-26060123" },
  { id: "TXN-1002", date: "Today 11:05", total: 980, type: "Order", invoice: "INV-26060122" },
  { id: "TXN-1001", date: "Yesterday", total: 1520, type: "Sale", invoice: "INV-26060121" },
];

export default function HistoryPage() {
  return (
    <AppLayout>
      <h1 className="text-2xl font-semibold mb-4">History</h1>

      <div className="bg-white rounded-2xl border divide-y">
        {demoHistory.map((item) => (
          <div key={item.id} className="px-4 py-4 flex items-center justify-between">
            <div>
              <div className="font-medium">{item.id}</div>
              <div className="text-sm text-gray-500">{item.date} • {item.type}</div>
            </div>
            <div className="text-right">
              <div className="font-medium">LKR {item.total}</div>
              <Link href="/sale" className="text-xs text-blue-600">View invoice</Link>
            </div>
          </div>
        ))}
      </div>

      <p className="mt-6 text-sm text-gray-500 text-center">
        Full history + search + filters coming with Firebase.
      </p>
    </AppLayout>
  );
}
