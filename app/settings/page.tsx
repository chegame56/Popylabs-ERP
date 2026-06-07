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
  const [address, setAddress] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [invoicePrefix, setInvoicePrefix] = useState("INV-");
  const [defaultVatRate, setDefaultVatRate] = useState(18);
  const [issuesTaxInvoices, setIssuesTaxInvoices] = useState(false);
  const [lowStockThreshold, setLowStockThreshold] = useState(10);
  const [saving, setSaving] = useState(false);

  // Seed form from loaded organization
  useEffect(() => {
    if (organization) {
      setLegalName(organization.legalName || "");
      setTin(organization.tin || "");
      setAddress(organization.address || "");
      setContactPhone(organization.contactPhone || "");
      setLogoUrl(organization.logoUrl || "");
      setInvoicePrefix(organization.invoicePrefix || "INV-");
      setDefaultVatRate(organization.defaultVatRate ?? 18);
      setIssuesTaxInvoices(!!organization.issuesTaxInvoices);
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
        address: address.trim() || "",
        contactPhone: contactPhone.trim() || "",
        logoUrl: logoUrl.trim() || "",
        invoicePrefix: invoicePrefix.trim() || "INV-",
        defaultVatRate: Number(defaultVatRate) || 18,
        issuesTaxInvoices: !!issuesTaxInvoices,
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
          <h2 className="font-medium mb-3">Business Profile (appears on bills &amp; receipts)</h2>
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
              <label className="text-sm block mb-1">Business Address (Place of Supply)</label>
              <textarea
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full border rounded-xl px-4 py-2.5 min-h-[64px]"
                placeholder="No. 123, Main Street, Colombo 07"
              />
            </div>
            <div>
              <label className="text-sm block mb-1">Contact Phone</label>
              <input
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                className="w-full border rounded-xl px-4 py-2.5"
                placeholder="+94 77 123 4567"
              />
            </div>
            <div>
              <label className="text-sm block mb-1">Logo URL (public image, optional, small size)</label>
              <input
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                className="w-full border rounded-xl px-4 py-2.5"
                placeholder="https://example.com/logo.png"
              />
            </div>

            {/* Tax Invoice mode toggle - controls whether documents are simple receipts or full IRD Tax Invoices */}
            <div className="pt-2 border-t">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={issuesTaxInvoices}
                  onChange={(e) => setIssuesTaxInvoices(e.target.checked)}
                  className="mt-1 h-4 w-4 accent-black border-gray-300 rounded"
                />
                <div>
                  <span className="text-sm font-medium">Tax Invoice applicable</span>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Turn this on only if your business is registered for VAT with the IRD and must issue official Tax Invoices.
                  </p>
                </div>
              </label>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm block mb-1">Default VAT Rate (%)</label>
                <input
                  type="number"
                  value={defaultVatRate}
                  onChange={(e) => setDefaultVatRate(parseInt(e.target.value) || 18)}
                  className="w-full border rounded-xl px-4 py-2.5"
                />
                <p className="text-xs text-gray-500 mt-1">Currently 18% standard rate in Sri Lanka.</p>
              </div>
              <div>
                <label className="text-sm block mb-1">Invoice Prefix</label>
                <input
                  value={invoicePrefix}
                  onChange={(e) => setInvoicePrefix(e.target.value)}
                  className="w-full border rounded-xl px-4 py-2.5 font-mono"
                />
              </div>
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
            These values appear on every generated bill and control stock alerts.
          </p>
          <div className="mt-3 text-[10px] text-amber-600 bg-amber-50 border border-amber-200 rounded p-2">
            These details appear on bills. They also prepare your business for the upcoming IRD POS API (full compliance planned when the API is released).
          </div>
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
