"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User, Session, AuthError, AuthResponse } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

type AuthResultError = AuthError | Error | null;
const DERYCRAFT_LIGHT_POSTGRES_CUSTOMER_AUTH_DISABLED =
  process.env.NEXT_PUBLIC_RUNTIME_DATABASE_MODE?.trim().toLowerCase() === "light_postgres" &&
  process.env.NEXT_PUBLIC_STORE_SLUG?.trim() === "derycraftcomtr";
const CUSTOMER_AUTH_DISABLED_MESSAGE =
  "Musteri hesabi ozellikleri gecici olarak devre disi. Siparislerinizi misafir olarak tamamlayabilirsiniz.";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string, captchaToken?: string) => Promise<{ error: AuthResultError; data?: AuthResponse['data'] }>;
  signUp: (email: string, password: string, metadata?: Record<string, unknown>, captchaToken?: string) => Promise<{ error: AuthResultError; data: AuthResponse['data'] | null }>;
  signOut: () => Promise<{ error: AuthResultError }>;
  resetPassword: (email: string) => Promise<{ error: AuthResultError }>;
  updatePassword: (newPassword: string) => Promise<{ error: AuthResultError }>;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (DERYCRAFT_LIGHT_POSTGRES_CUSTOMER_AUTH_DISABLED) {
      setSession(null);
      setUser(null);
      setLoading(false);
      return;
    }

    // Get initial session
    const getInitialSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        setSession(session);
        setUser(session?.user ?? null);
      } catch (error) {
        console.error("Error getting initial session:", error);
      } finally {
        setLoading(false);
      }
    };

    getInitialSession();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    if (DERYCRAFT_LIGHT_POSTGRES_CUSTOMER_AUTH_DISABLED) {
      return {
        error: new Error(CUSTOMER_AUTH_DISABLED_MESSAGE),
      };
    }

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        return {
          error: new Error(payload.error || "Giris yapilamadi."),
        };
      }

      const session = payload.session;
      if (!session?.access_token || !session?.refresh_token) {
        return {
          error: new Error("Giris oturumu olusturulamadi."),
        };
      }

      const { data, error } = await supabase.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      });

      return { error, data };
    } catch (error) {
      return {
        error: error instanceof Error ? error : new Error("Giris yapilamadi."),
      };
    }
  };

  const signUp = async (email: string, password: string, metadata?: Record<string, unknown>) => {
    if (DERYCRAFT_LIGHT_POSTGRES_CUSTOMER_AUTH_DISABLED) {
      return {
        error: new Error(CUSTOMER_AUTH_DISABLED_MESSAGE),
        data: null,
      };
    }

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, metadata }),
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        return {
          error: new Error(payload.error || "Kayit olusturulamadi."),
          data: null,
        };
      }

      const loginResult = await signIn(email, password);
      if (loginResult.error) {
        return {
          error: loginResult.error,
          data: loginResult.data ?? null,
        };
      }

      return {
        error: null,
        data: loginResult.data ?? null,
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error : new Error("Kayit olusturulamadi."),
        data: null,
      };
    }
  };

  const signOut = async () => {
    if (DERYCRAFT_LIGHT_POSTGRES_CUSTOMER_AUTH_DISABLED) {
      setSession(null);
      setUser(null);
      return { error: null };
    }

    const { error } = await supabase.auth.signOut();
    return { error };
  };

  const resetPassword = async (email: string) => {
    if (DERYCRAFT_LIGHT_POSTGRES_CUSTOMER_AUTH_DISABLED) {
      return { error: new Error(CUSTOMER_AUTH_DISABLED_MESSAGE) };
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: typeof window !== 'undefined' ? `${window.location.origin}/sifre-yenile` : undefined,
    });
    return { error };
  };

  const updatePassword = async (newPassword: string) => {
    if (DERYCRAFT_LIGHT_POSTGRES_CUSTOMER_AUTH_DISABLED) {
      return { error: new Error(CUSTOMER_AUTH_DISABLED_MESSAGE) };
    }

    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });
    return { error };
  };

  const refreshSession = async () => {
    if (DERYCRAFT_LIGHT_POSTGRES_CUSTOMER_AUTH_DISABLED) {
      setSession(null);
      setUser(null);
      return;
    }

    try {
      const { data } = await supabase.auth.refreshSession();
      setSession(data.session);
      setUser(data.session?.user ?? null);
    } catch (error) {
      console.error("Error refreshing session:", error);
    }
  };

  const value: AuthContextType = {
    user,
    session,
    loading,
    signIn,
    signUp,
    signOut,
    resetPassword,
    updatePassword,
    refreshSession,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
