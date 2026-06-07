"use client";

import AppLayout from "@/components/AppLayout";
import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { toast } from "sonner";

export default function ScannerPage() {
  const [isScanning, setIsScanning] = useState(false);
  const [lastScanned, setLastScanned] = useState<string | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerId = "qr-reader";

  const startScanner = async () => {
    try {
      const html5QrCode = new Html5Qrcode(containerId);
      scannerRef.current = html5QrCode;

      await html5QrCode.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          setLastScanned(decodedText);
          // Future: look up product by barcode + add to shared active cart (realtime)
          html5QrCode.pause();
        },
        (errorMessage) => {
          // ignore continuous scan errors
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

  const stopScanner = async () => {
    if (scannerRef.current) {
      await scannerRef.current.stop();
      scannerRef.current = null;
    }
    setIsScanning(false);
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
          Point your phone camera at a barcode. In the full version this will add the item to your active sale on any device.
        </p>

        <div id={containerId} className="w-full bg-black rounded-2xl overflow-hidden aspect-square mb-4" />

        <div className="flex gap-3">
          {!isScanning ? (
            <button
              onClick={startScanner}
              className="flex-1 btn-large bg-black text-white rounded-2xl"
            >
              Start Camera Scanner
            </button>
          ) : (
            <button
              onClick={stopScanner}
              className="flex-1 btn-large border rounded-2xl"
            >
              Stop Scanner
            </button>
          )}
        </div>

        {lastScanned && (
          <div className="mt-6 p-4 bg-white border rounded-2xl">
            <div className="text-sm text-gray-500">Last scanned code:</div>
            <div className="font-mono text-lg break-all">{lastScanned}</div>
            <div className="text-xs mt-2 text-emerald-600">
              Scanned items can be added manually on the New Sale screen for now. Full cross-device active cart coming soon.
            </div>
          </div>
        )}

        <div className="mt-8 text-xs text-gray-500">
          Tip: Use the same Popylabs ERP account on your phone and desktop at the same time for the hybrid scanner experience.
        </div>
      </div>
    </AppLayout>
  );
}
