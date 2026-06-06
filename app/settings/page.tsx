"use client";

import AppLayout from "@/components/AppLayout";
import { useState } from "react";

export default function SettingsPage() {
  const [businessName, setBusinessName] = useState("Green Mart Demo");
  const [tin, setTin] = useState("123456789V");
  const [prefix, setPrefix] = useState("INV-");

  return (
    <AppLayout>
      <h1 className="text-2xl font-semibold mb-6">Settings</h1>

      <div className="max-w-lg space-y-8">
        <section>
          <h2 className="font-medium mb-3">Business Profile (required for TAX INVOICE)</h2>
          <div className="space-y-4 bg-white border rounded-2xl p-5">
            <div>
              <label className="text-sm block mb-1">Legal Business Name</label>
              <input
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                className="w-full border rounded-xl px-4 py-2.5"
              />
            </div>
            <div>
              <label className="text-sm block mb-1">TIN (Taxpayer Identification Number)</label>
              <input
                value={tin}
                onChange={(e) => setTin(e.target.value)}
                className="w-full border rounded-xl px-4 py-2.5"
              />
            </div>
            <div>
              <label className="text-sm block mb-1">Invoice Prefix</label>
              <input
                value={prefix}
                onChange={(e) => setPrefix(e.target.value)}
                className="w-full border rounded-xl px-4 py-2.5 font-mono"
              />
            </div>
          </div>
          <p className="text-xs mt-2 text-gray-500">
            These fields will be used when generating IRD-compliant TAX INVOICES.
          </p>
        </section>

        <section>
          <button
            onClick={() => alert("In real version this would save to your Organization document in Firestore")}
            className="btn-large w-full bg-black text-white rounded-2xl"
          >
            Save Business Settings
          </button>
        </section>

        <div className="text-xs text-gray-400">
          More settings (low stock threshold, receipt footer, branches) will be added as we build the real backend.
        </div>
      </div>
    </AppLayout>
  );
}
