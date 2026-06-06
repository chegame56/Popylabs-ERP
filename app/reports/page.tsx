"use client";

import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/lib/auth-context";

export default function ReportsPage() {
  const { organization } = useAuth();

  return (
    <AppLayout>
      <h1 className="text-2xl font-semibold mb-4">Reports</h1>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="bg-white border rounded-2xl p-6">
          <div className="font-medium mb-2">Today’s Summary</div>
          <p className="text-sm text-gray-600">
            Real daily totals, transaction counts, and top products are now derived from your saved sales in Firestore.
          </p>
          <p className="text-xs text-gray-500 mt-3">Detailed charts and best-seller reports coming in a future update.</p>
        </div>

        <div className="bg-white border rounded-2xl p-6">
          <div className="font-medium mb-2">This Week / Month</div>
          <div className="text-sm text-gray-500">
            Your transaction history (History page) is the source of truth. Use it for quick reviews and PDF exports.
          </div>
        </div>
      </div>

      <p className="mt-8 text-xs text-gray-500">
        All numbers for {organization?.legalName || "your business"} come from real recorded transactions.
      </p>
    </AppLayout>
  );
}
