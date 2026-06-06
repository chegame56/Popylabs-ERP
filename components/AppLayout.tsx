"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Scan,
  History,
  BarChart3,
  Settings,
  LogOut,
} from "lucide-react";
import { cnSimple as cn } from "@/lib/cn";
import { useAuth } from "@/lib/auth-context";
import { useEffect, useState } from "react";

// Small inline recovery component shown only when we have a user but no org profile.
// Lets the owner bootstrap their organization directly (rules permit it via ownerUid).
function RecoverySetup() {
  const { initializeOrganization, refreshOrganization } = useAuth();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      await initializeOrganization(name);
      // After success the context will have the org; a hard refresh of data is good too.
      await refreshOrganization?.();
    } catch {
      // initializeOrganization already toasts the error
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-white border border-red-200 rounded-xl p-4 text-sm">
      <div className="font-medium text-gray-800 mb-2">Quick recovery — create / link your organization</div>
      <form onSubmit={handleCreate} className="flex flex-col sm:flex-row gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your business legal name (e.g. Green Mart (Pvt) Ltd)"
          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
          disabled={busy}
          required
        />
        <button
          type="submit"
          disabled={busy || !name.trim()}
          className="rounded-lg bg-black text-white px-4 py-2 text-sm font-medium disabled:opacity-60"
        >
          {busy ? "Creating..." : "Create my organization"}
        </button>
        <button
          type="button"
          onClick={() => refreshOrganization?.()}
          disabled={busy}
          className="rounded-lg border px-3 py-2 text-sm hover:bg-gray-50"
        >
          Retry load
        </button>
      </form>
      <p className="mt-2 text-[11px] text-gray-500">
        This uses the same logic as registration. After success the page will reload your data. If it still fails, deploy the rules from the repo.
      </p>
    </div>
  );
}

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/products", label: "Products", icon: Package },
  { href: "/sale", label: "New Sale", icon: ShoppingCart },
  { href: "/scanner", label: "Scan", icon: Scan },
  { href: "/history", label: "History", icon: History },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, organization, loading, signOut } = useAuth();

  // Basic client-side auth guard
  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-4"></div>
          <p className="text-sm text-gray-500">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null; // Will redirect via useEffect
  }

  const businessName = organization?.legalName || "Your Business";

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-gray-50">
      {/* Sidebar / Top nav */}
      <nav className="border-b md:border-b-0 md:border-r bg-white md:w-60">
        <div className="px-4 py-4 flex items-center justify-between md:block">
          <Link href="/dashboard" className="font-semibold text-xl">
            Popylabs ERP
          </Link>
          <button
            onClick={signOut}
            className="md:hidden text-sm flex items-center gap-1 text-gray-500"
          >
            <LogOut className="w-4 h-4" /> Logout
          </button>
        </div>

        <div className="px-2 pb-4 md:pt-2 flex md:flex-col gap-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition",
                  active
                    ? "bg-gray-900 text-white"
                    : "hover:bg-gray-100 text-gray-700"
                )}
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}

          <button
            onClick={signOut}
            className="hidden md:flex items-center gap-3 px-4 py-3 mt-4 text-sm text-red-600 hover:bg-red-50 rounded-xl w-full"
          >
            <LogOut className="w-4 h-4" /> Logout
          </button>
        </div>
      </nav>

      {/* Main content */}
      <div className="flex-1 flex flex-col">
        {/* Top bar with business name */}
        <div className="h-12 border-b bg-white px-4 flex items-center text-sm text-gray-500">
          <span className="font-medium text-gray-700">{businessName}</span>
          <span className="ml-auto text-[10px] px-2 py-0.5 rounded bg-gray-100 text-gray-500">
            Live
          </span>
        </div>

        {/* Prominent recovery UI when we have an authenticated user but no organization profile.
            This happens if:
            - Firestore rules have not been deployed (most common after `vercel deploy`)
            - The /users/{uid} doc or the linked organization doc is missing / has wrong fields
            - A previous register partially succeeded (org created but users profile not linked)
            The inline form lets the signed-in user self-recover by creating their org + profile link.
        */}
        {user && !organization && (
          <div className="border-b bg-red-50">
            <div className="max-w-5xl mx-auto px-4 py-3 text-sm text-red-700 flex flex-col gap-1">
              <div className="font-medium">Could not load your organization profile.</div>
              <div>
                Common causes: Firestore security rules not deployed for this Firebase project, or your user
                profile document is missing. See <Link href="/docs/firebase-setup.md" className="underline">docs/firebase-setup.md</Link>.
              </div>
            </div>

            {/* Self-service recovery for already-authenticated users (no need to re-register) */}
            <div className="max-w-5xl mx-auto px-4 pb-4">
              <RecoverySetup />
            </div>
          </div>
        )}

        <main className="flex-1 p-4 md:p-6 max-w-5xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
