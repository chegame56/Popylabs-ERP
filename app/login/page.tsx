"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

// Temporary: Will be replaced with real Firebase Auth
export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // TODO: Replace with real Firebase signInWithEmailAndPassword
    // For now: fake login and go to dashboard
    setTimeout(() => {
      // Simulate successful auth
      localStorage.setItem("popylabs_demo_user", email);
      router.push("/dashboard");
      setLoading(false);
    }, 600);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-semibold">Popylabs ERP</h1>
          <p className="text-gray-500 mt-1">Sign in to your business</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-xl border border-gray-300 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-black"
              placeholder="you@business.lk"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full rounded-xl border border-gray-300 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-black"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn-large w-full bg-black text-white rounded-xl font-medium disabled:opacity-70"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <div className="mt-6 text-center text-sm">
          <span className="text-gray-500">New business? </span>
          <Link href="/register" className="font-medium underline">
            Create account
          </Link>
        </div>

        <p className="mt-8 text-[10px] text-center text-gray-400">
          For demo only. Real Firebase Auth coming in next step.
        </p>
      </div>
    </div>
  );
}
