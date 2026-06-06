"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-gray-50">
      {/* Sidebar / Top nav */}
      <nav className="border-b md:border-b-0 md:border-r bg-white md:w-60">
        <div className="px-4 py-4 flex items-center justify-between md:block">
          <Link href="/dashboard" className="font-semibold text-xl">
            Popylabs ERP
          </Link>
          <button
            onClick={() => {
              localStorage.removeItem("popylabs_demo_user");
              window.location.href = "/login";
            }}
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
            onClick={() => {
              localStorage.removeItem("popylabs_demo_user");
              window.location.href = "/login";
            }}
            className="hidden md:flex items-center gap-3 px-4 py-3 mt-4 text-sm text-red-600 hover:bg-red-50 rounded-xl w-full"
          >
            <LogOut className="w-4 h-4" /> Logout
          </button>
        </div>
      </nav>

      {/* Main content */}
      <div className="flex-1 flex flex-col">
        {/* Top bar with offline indicator placeholder */}
        <div className="h-12 border-b bg-white px-4 flex items-center text-sm text-gray-500">
          <span className="font-medium text-gray-700">Demo Business</span>
          <span className="ml-auto text-xs px-2 py-0.5 rounded bg-yellow-100 text-yellow-800">
            Offline mode (demo)
          </span>
        </div>

        <main className="flex-1 p-4 md:p-6 max-w-5xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
