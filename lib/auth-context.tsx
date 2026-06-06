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
  invoicePrefix: string;
  nextInvoiceSequence: number;
  defaultVatRate?: number;
  lowStockThreshold?: number;
  createdAt?: any;
}

interface AuthContextType {
  user: User | null;
  organization: Organization | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshOrganization: () => Promise<void>;
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
          // Surface a clear message when it's a permissions issue (very common during first setup)
          if (err?.code === "permission-denied" || err?.message?.includes("permission")) {
            toast.error("Firestore permission denied. Please set security rules (see docs/firebase-setup.md)");
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
