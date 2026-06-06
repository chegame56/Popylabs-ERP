"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { toast } from "sonner";

export default function RegisterPage() {
  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessName.trim()) {
      toast.error("Please enter your business name");
      return;
    }
    setLoading(true);

    try {
      // 1. Create Firebase Auth user
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const firebaseUser = userCredential.user;

      // 2. Create Organization document
      const orgId = crypto.randomUUID(); // simple unique id for v1
      const invoicePrefix = "INV-";

      await setDoc(doc(db, "organizations", orgId), {
        legalName: businessName.trim(),
        tin: "",
        address: "",
        invoicePrefix,
        nextInvoiceSequence: 1,
        defaultVatRate: 18,
        lowStockThreshold: 10,
        createdAt: serverTimestamp(),
        ownerUid: firebaseUser.uid,
      });

      // 3. Create user profile linking to the organization
      await setDoc(doc(db, "users", firebaseUser.uid), {
        email: firebaseUser.email,
        organizationId: orgId,
        role: "owner",
        createdAt: serverTimestamp(),
      });

      toast.success("Account created. Welcome!");
      router.push("/dashboard");
    } catch (error: any) {
      console.error(error);
      let message = "Failed to create account";
      if (error.code === "auth/email-already-in-use") {
        message = "This email is already registered";
      } else if (error.code === "auth/weak-password") {
        message = "Password should be at least 6 characters";
      } else if (error.code === "auth/invalid-email") {
        message = "Please enter a valid email address";
      } else if (error.code === "permission-denied" || (error.message && error.message.includes("permission"))) {
        message = "Firestore permission denied. Set rules in Firebase Console (see docs/firebase-setup.md)";
      }
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-semibold">Create your business</h1>
          <p className="text-gray-500 mt-1">Start using Popylabs ERP in minutes</p>
        </div>

        <form onSubmit={handleRegister} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">Business name</label>
            <input
              type="text"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              required
              className="w-full rounded-xl border border-gray-300 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-black"
              placeholder="Green Mart"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-xl border border-gray-300 px-4 py-3"
              placeholder="owner@business.lk"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full rounded-xl border border-gray-300 px-4 py-3"
              placeholder="At least 6 characters"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn-large w-full bg-black text-white rounded-xl font-medium disabled:opacity-70 mt-2"
          >
            {loading ? "Creating account..." : "Create account & start"}
          </button>
        </form>

        <div className="mt-6 text-center text-sm">
          <span className="text-gray-500">Already have an account? </span>
          <Link href="/login" className="font-medium underline">
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
