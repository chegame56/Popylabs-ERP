"use client";

import AppLayout from "@/components/AppLayout";

export default function ReportsPage() {
  return (
    <AppLayout>
      <h1 className="text-2xl font-semibold mb-4">Reports</h1>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="bg-white border rounded-2xl p-6">
          <div className="font-medium mb-2">Today’s Summary (Demo)</div>
          <ul className="text-sm space-y-1 text-gray-600">
            <li>Total Sales: LKR 12,450</li>
            <li>Transactions: 18</li>
            <li>Top product: Coca Cola 1L</li>
            <li>Low stock items: 4</li>
          </ul>
        </div>

        <div className="bg-white border rounded-2xl p-6">
          <div className="font-medium mb-2">This Week</div>
          <div className="text-sm text-gray-500">Simple charts and best-sellers will appear here.</div>
        </div>
      </div>

      <p className="mt-8 text-xs text-gray-500">
        These will be powered by real transaction data from Firestore.
      </p>
    </AppLayout>
  );
}
