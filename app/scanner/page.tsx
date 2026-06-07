"use client";

import AppLayout from "@/components/AppLayout";
import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

export default function ScannerPage() {
  const { organization, user } = useAuth();

  const [isScanning, setIsScanning] = useState(false);
  const [lastScanned, setLastScanned] = useState<string | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerId = "qr-reader";

  // Lightweight local products list — only used for duplicate checks before emitting a productAddIntent.
  // This enables the phone to give instant "already exists" feedback for the hybrid catalog flow.
  const [products, setProducts] = useState<Array<{ id?: string; name: string; barcode?: string }>>([]);

  // 'sale' = current behavior (lastScanned only for now). 'add-product' = write productAddIntents for hybrid desktop form.
  const [scanMode, setScanMode] = useState<'sale' | 'add-product'>('sale');

  // Load products for this org (lightweight duplicate check only — not a full list UI)
  useEffect(() => {
    if (!organization) return;

    const q = query(
      collection(db, "products"),
      where("organizationId", "==", organization.id),
      orderBy("name")
    );
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => {
        const data = d.data() as any;
        return { id: d.id, name: data.name || "", barcode: data.barcode };
      });
      setProducts(list);
    });
    return () => unsub();
  }, [organization]);

  // Shared camera starter. The decode side-effect depends on the current scanMode.
  const startScannerWithMode = async (mode: 'sale' | 'add-product') => {
    // If already running a different mode, stop first so we can reconfigure the callback behavior
    if (scannerRef.current) {
      await scannerRef.current.stop().catch(() => {});
      scannerRef.current = null;
    }

    setScanMode(mode);

    try {
      const html5QrCode = new Html5Qrcode(containerId);
      scannerRef.current = html5QrCode;

      await html5QrCode.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          setLastScanned(decodedText);
          html5QrCode.pause();
          handleDecoded(decodedText, mode);
        },
        (_errorMessage) => {
          // ignore continuous scan errors (same as before)
        }
      );
      setIsScanning(true);
    } catch (err: any) {
      console.error("Camera start failed:", err);
      const msg = (err?.message || "").toLowerCase();
      if (msg.includes("permission") || msg.includes("denied") || msg.includes("not allowed")) {
        toast.error("Camera permission denied. Please allow camera access in your browser settings and try again.");
      } else if (msg.includes("not found") || msg.includes("no camera")) {
        toast.error("No camera found on this device.");
      } else if (window.location.protocol !== "https:" && window.location.hostname !== "localhost") {
        toast.error("Camera requires HTTPS. Please access over a secure connection.");
      } else {
        toast.error("Camera access failed. Please allow camera permission and ensure you're on HTTPS or localhost.");
      }
    }
  };

  // Existing entry point — keeps the classic sale-oriented scanner behavior (currently just records lastScanned)
  const startScanner = () => startScannerWithMode('sale');

  // New hybrid entry point: phone camera → writes intent so desktop /products opens the prefilled Add form
  const startForNewProduct = () => startScannerWithMode('add-product');

  // Central decode handler. Behavior branches on the mode that was active when the scan started.
  const handleDecoded = (decodedText: string, modeAtScan: 'sale' | 'add-product') => {
    const trimmed = decodedText.trim();
    if (!trimmed) return;

    if (modeAtScan === 'sale') {
      // Current / future sale behavior (unchanged for now)
      // Future: look up + write to active cart. For the moment we just show lastScanned.
      return;
    }

    // === 'add-product' mode (hybrid catalog signaling) ===
    const existing = products.find((p) => p.barcode && p.barcode.trim() === trimmed);
    if (existing) {
      toast.error(`Barcode already used by "${existing.name}"`);
      return;
    }

    // New barcode — emit the lightweight intent. The desktop /products listener will open the real Add form.
    if (!organization) {
      toast.error("No organization loaded — cannot send scan");
      return;
    }

    addDoc(collection(db, "productAddIntents"), {
      organizationId: organization.id,
      barcode: trimmed,
      createdAt: serverTimestamp(),
      createdBy: user?.uid || null,
      source: "scanner",
    })
      .then(() => {
        toast.success("Scan sent to your Products screen");
      })
      .catch((e) => {
        console.error("Failed to write productAddIntent:", e);
        toast.error("Failed to forward the scan. Check your connection and rules.");
      });
  };

  const stopScanner = async () => {
    if (scannerRef.current) {
      await scannerRef.current.stop();
      scannerRef.current = null;
    }
    setIsScanning(false);
    setScanMode('sale');
  };

  useEffect(() => {
    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
      }
    };
  }, []);

  return (
    <AppLayout>
      <div className="max-w-xl mx-auto">
        <h1 className="text-2xl font-semibold mb-2">Scanner</h1>
        <p className="text-gray-600 mb-6">
          Point your phone camera at a barcode. Choose the mode below. "Scan to add new product to catalog" is the hybrid flow: phone camera → the normal Add Product form opens automatically on your desktop /products page.
        </p>

        <div id={containerId} className="w-full bg-black rounded-2xl overflow-hidden aspect-square mb-4" />

        {/* Controls — two distinct scanner targets for hybrid clarity */}
        {!isScanning ? (
          <div className="flex flex-col gap-3">
            {/* Primary existing path (sale) — kept exactly as before for people already using it */}
            <button
              onClick={startScanner}
              className="w-full btn-large border rounded-2xl"
            >
              Start Camera Scanner (for sales)
            </button>

            {/* New hybrid path — the one that makes "phone = scanner, desktop gets the Add Product window" work */}
            <button
              onClick={startForNewProduct}
              className="w-full btn-large bg-black text-white rounded-2xl"
            >
              Scan to add new product to catalog
            </button>
            <div className="text-[11px] text-center text-gray-500 -mt-1">
              Use this on your phone. The pre-filled Add form will appear on any open /products desktop tab.
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <button
              onClick={stopScanner}
              className="w-full btn-large border rounded-2xl"
            >
              Stop Scanner
            </button>
            {scanMode === 'add-product' && (
              <div className="text-center text-xs text-emerald-600 font-medium">
                Catalog mode active — scanning for new products only
              </div>
            )}
          </div>
        )}

        {lastScanned && (
          <div className="mt-6 p-4 bg-white border rounded-2xl">
            <div className="text-sm text-gray-500">Last scanned code:</div>
            <div className="font-mono text-lg break-all">{lastScanned}</div>

            {scanMode === 'add-product' ? (
              <div className="text-xs mt-3 text-emerald-600">
                Sent to your Products screen(s). Open (or keep open) the Products page on desktop — the normal "Add Product" form will appear with this barcode pre-filled.
              </div>
            ) : (
              <div className="text-xs mt-2 text-emerald-600">
                Scanned items can be added manually on the New Sale screen for now. Full cross-device active cart coming soon.
              </div>
            )}
          </div>
        )}

        <div className="mt-8 text-xs text-gray-500">
          Tip: Use the same Popylabs ERP account on your phone and desktop at the same time for the hybrid scanner experience.
        </div>
      </div>
    </AppLayout>
  );
}
