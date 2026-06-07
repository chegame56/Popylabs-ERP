"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { User, onAuthStateChanged, signOut as firebaseSignOut } from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "./firebase";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export interface Organization {
  id: string;
  legalName: string;
  tin?: string;
  address?: string;
  contactPhone?: string;
  logoUrl?: string;
  issuesTaxInvoices: boolean;      // Controls mode: false = Normal Receipt (default), true = full Tax Invoice
  invoicePrefix: string;
  nextInvoiceSequence: number;
  defaultVatRate?: number;         // Only applied when issuesTaxInvoices === true
  lowStockThreshold?: number;
  branchCode?: string;
  lastSequenceResetMonth?: string;
  createdAt?: any;
  ownerUid?: string;
}

interface AuthContextType {
  user: User | null;
  organization: Organization | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshOrganization: () => Promise<void>;
  /** Allows a signed-in user who has no profile/org yet (e.g. after a partial register or direct Auth create)
   *  to bootstrap their organization. This is permitted by the current Firestore rules as long as they
   *  set themselves as ownerUid.
   */
  initializeOrganization: (legalName: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const fetchOrganization = async (orgId: string): Promise<Organization | null> => {
    try {
      const orgRef = doc(db, "organizations", orgId);
      const snap = await getDoc(orgRef);
      if (snap.exists()) {
        return { id: snap.id, ...snap.data() } as Organization;
      }
      return null;
    } catch (error) {
      console.error("Error fetching organization:", error);
      return null;
    }
  };

  const refreshOrganization = async () => {
    if (!user) return;
    // For v1 we store orgId on a simple user profile doc
    const userProfileRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userProfileRef);
    if (userSnap.exists()) {
      const data = userSnap.data();
      if (data.organizationId) {
        const org = await fetchOrganization(data.organizationId);
        setOrganization(org);
      }
    }
  };

  const initializeOrganization = async (legalName: string) => {
    if (!user) {
      throw new Error("You must be signed in to initialize an organization");
    }
    const trimmed = legalName.trim();
    if (!trimmed) {
      throw new Error("Business name is required");
    }

    try {
      const orgId = crypto.randomUUID();
      const invoicePrefix = "INV-";

      // Create the organization (rules allow this when ownerUid == current uid)
      await setDoc(doc(db, "organizations", orgId), {
        legalName: trimmed,
        tin: "",
        address: "",
        contactPhone: "",
        logoUrl: "",
        issuesTaxInvoices: false,   // default: clean Normal Receipt mode (no tax/VAT on documents)
        invoicePrefix,
        nextInvoiceSequence: 1,
        defaultVatRate: 18,
        lowStockThreshold: 10,
        branchCode: "",
        createdAt: serverTimestamp(),
        ownerUid: user.uid,
      });

      // Link the current user to it (rules allow the owner of the users/{uid} doc to write it)
      await setDoc(doc(db, "users", user.uid), {
        email: user.email,
        organizationId: orgId,
        role: "owner",
        createdAt: serverTimestamp(),
      });

      // Load it immediately into context
      const org = await fetchOrganization(orgId);
      setOrganization(org);

      toast.success("Organization profile created");
    } catch (error: any) {
      console.error("initializeOrganization error:", error);
      if (error?.code === "permission-denied" || (error?.message || "").includes("permission")) {
        toast.error("Permission denied. Make sure firestore.rules are deployed (see docs/firebase-setup.md)");
      } else {
        toast.error("Failed to create organization profile");
      }
      throw error;
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setLoading(true);
      setUser(firebaseUser);

      if (firebaseUser) {
        // Try to load the user's organization
        try {
          const userProfileRef = doc(db, "users", firebaseUser.uid);
          const userSnap = await getDoc(userProfileRef);

          if (userSnap.exists()) {
            const profileData = userSnap.data();
            if (profileData.organizationId) {
              const org = await fetchOrganization(profileData.organizationId);
              setOrganization(org);
            }
          } else {
            // No profile yet (shouldn't happen often after register)
            setOrganization(null);
          }
        } catch (err: any) {
          console.error("Auth state org fetch error:", err);
          // Surface a clear message when it's a permissions issue (very common during first setup or after Vercel deploy)
          if (err?.code === "permission-denied" || err?.message?.includes("permission")) {
            toast.error("Firestore permission denied — deploy the rules: firebase deploy --only firestore:rules (see docs/firebase-setup.md)");
          }
          setOrganization(null);
        }
      } else {
        setOrganization(null);
      }

      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signOut = async () => {
    try {
      await firebaseSignOut(auth);
      setUser(null);
      setOrganization(null);
      router.push("/login");
      toast.success("Signed out");
    } catch (error) {
      console.error("Sign out error:", error);
      toast.error("Failed to sign out");
    }
  };

  const value: AuthContextType = {
    user,
    organization,
    loading,
    signOut,
    refreshOrganization,
    initializeOrganization,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
