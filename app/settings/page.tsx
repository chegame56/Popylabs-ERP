"use client";

import AppLayout from "@/components/AppLayout";
import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { toast } from "sonner";

export default function SettingsPage() {
  const { organization, refreshOrganization } = useAuth();

  const [legalName, setLegalName] = useState("");
  const [tin, setTin] = useState("");
  const [invoicePrefix, setInvoicePrefix] = useState("INV-");
  const [lowStockThreshold, setLowStockThreshold] = useState(10);
  const [saving, setSaving] = useState(false);

  // Seed form from loaded organization
  useEffect(() => {
    if (organization) {
      setLegalName(organization.legalName || "");
      setTin(organization.tin || "");
      setInvoicePrefix(organization.invoicePrefix || "INV-");
      setLowStockThreshold(organization.lowStockThreshold ?? 10);
    }
  }, [organization]);

  const handleSave = async () => {
    if (!organization) {
      toast.error("Organization not loaded yet");
      return;
    }
    if (!legalName.trim()) {
      toast.error("Legal business name is required");
      return;
    }

    setSaving(true);
    try {
      const orgRef = doc(db, "organizations", organization.id);
      await updateDoc(orgRef, {
        legalName: legalName.trim(),
        tin: tin.trim() || "",
        invoicePrefix: invoicePrefix.trim() || "INV-",
        lowStockThreshold: Number(lowStockThreshold) || 10,
        updatedAt: serverTimestamp(),
      });

      await refreshOrganization();
      toast.success("Business settings saved");
    } catch (err: any) {
      console.error("Save org settings error:", err);
      if (err?.code === "permission-denied") {
        toast.error("Permission denied — deploy the production Firestore rules.");
      } else {
        toast.error("Failed to save settings");
      }
    } finally {
      setSaving(false);
    }
  };

  if (!organization) {
    return (
      <AppLayout>
        <div className="p-8 text-center text-gray-500">Loading organization settings...</div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <h1 className="text-2xl font-semibold mb-6">Settings</h1>

      <div className="max-w-lg space-y-8">
        <section>
          <h2 className="font-medium mb-3">Business Profile (used on TAX INVOICES)</h2>
          <div className="space-y-4 bg-white border rounded-2xl p-5">
            <div>
              <label className="text-sm block mb-1">Legal Business Name *</label>
              <input
                value={legalName}
                onChange={(e) => setLegalName(e.target.value)}
                className="w-full border rounded-xl px-4 py-2.5"
                placeholder="Green Mart"
              />
            </div>
            <div>
              <label className="text-sm block mb-1">TIN (Taxpayer Identification Number)</label>
              <input
                value={tin}
                onChange={(e) => setTin(e.target.value)}
                className="w-full border rounded-xl px-4 py-2.5"
                placeholder="123456789V"
              />
            </div>
            <div>
              <label className="text-sm block mb-1">Invoice Prefix</label>
              <input
                value={invoicePrefix}
                onChange={(e) => setInvoicePrefix(e.target.value)}
                className="w-full border rounded-xl px-4 py-2.5 font-mono"
              />
            </div>
            <div>
              <label className="text-sm block mb-1">Low Stock Threshold</label>
              <input
                type="number"
                value={lowStockThreshold}
                onChange={(e) => setLowStockThreshold(parseInt(e.target.value) || 10)}
                className="w-full border rounded-xl px-4 py-2.5"
              />
              <p className="text-xs text-gray-500 mt-1">Products below this number will be highlighted as low stock.</p>
            </div>
          </div>
          <p className="text-xs mt-2 text-gray-500">
            These values appear on every generated TAX INVOICE and control stock alerts.
          </p>
        </section>

        <section>
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-large w-full bg-black text-white rounded-2xl disabled:opacity-70"
          >
            {saving ? "Saving..." : "Save Business Settings"}
          </button>
        </section>

        <div className="text-xs text-gray-400">
          Invoice numbers are generated using your prefix + sequence (advanced safely in the database).
        </div>
      </div>
    </AppLayout>
  );
}
