import Link from "next/link";
import { ArrowRight } from "lucide-react";

export default function Landing() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-white">
      <div className="max-w-md w-full text-center space-y-8">
        <div>
          <h1 className="text-4xl font-bold tracking-tight">Popylabs ERP</h1>
          <p className="mt-3 text-lg text-gray-600">
            The simplest way for Sri Lankan small businesses to manage sales, stock, and records.
          </p>
        </div>

        <div className="space-y-3">
          <Link
            href="/login"
            className="btn-large w-full flex items-center justify-center gap-2 bg-black text-white rounded-xl py-3 font-medium hover:bg-gray-900 active:scale-[0.985] transition"
          >
            Get started <ArrowRight className="w-4 h-4" />
          </Link>

          <p className="text-sm text-gray-500">
            Works on phone or desktop. No scanner or printer required.
          </p>
        </div>

        <div className="pt-8 text-xs text-gray-400">
          Built for Sri Lankan SMEs • Professional bills with VAT
        </div>
      </div>
    </div>
  );
}
