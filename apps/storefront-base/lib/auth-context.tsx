"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { AuthError, AuthResponse, Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase-browser";
import { resolveCustomerAuthMode } from "@/lib/customer-auth-mode";

type AuthResultError = AuthError | Error | null;

const CUSTOMER_AUTH_UNAVAILABLE_MESSAGE =
  "Musteri hesabi girisi gecici olarak hazir degil. Misafir odeme kullanilabilir.";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string, captchaToken?: string) => Promise<{ error: AuthResultError; data?: AuthResponse['data'] | null }>;
  signUp: (email: string, password: string, metadata?: Record<string, unknown>, captchaToken?: string) => Promise<{ error: AuthResultError; data: AuthResponse['data'] | null }>;
  signOut: () => Promise<{ error: AuthResultError }>;
  resetPassword: (email: string) => Promise<{ error: AuthResultError }>;
  updatePassword: (newPassword: string) => Promise<{ error: AuthResultError }>;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

async function fetchLogtoSession() {
  const response = await fetch("/api/auth/session", {
    cache: "no-store",
    credentials: "same-origin",
  });

  if (!response.ok) {
    return null;
  }

  const payload = await response.json().catch(() => ({}));
  return (payload?.user as User | null) ?? null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const customerAuthMode = resolveCustomerAuthMode();
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (customerAuthMode === "disabled") {
      setSession(null);
      setUser(null);
      setLoading(false);
      return;
    }

    if (customerAuthMode === "logto") {
      let cancelled = false;

      const loadSession = async () => {
        try {
          const currentUser = await fetchLogtoSession();

          if (cancelled) {
            return;
          }

          setSession(null);
          setUser(currentUser);
        } catch (error) {
          if (!cancelled) {
            console.error("Error getting Logto customer session:", error);
            setSession(null);
            setUser(null);
          }
        } finally {
          if (!cancelled) {
            setLoading(false);
          }
        }
      };

      void loadSession();

      const handleFocus = () => {
        void loadSession();
      };

      window.addEventListener("focus", handleFocus);

      return () => {
        cancelled = true;
        window.removeEventListener("focus", handleFocus);
      };
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
  }, [customerAuthMode]);

  const signIn = async (email: string, password: string) => {
    if (customerAuthMode === "disabled") {
      return {
        error: new Error(CUSTOMER_AUTH_UNAVAILABLE_MESSAGE),
        data: null,
      };
    }

    if (customerAuthMode === "logto") {
      const url = new URL("/api/auth/sign-in", window.location.origin);
      url.searchParams.set("next", "/hesap");
      url.searchParams.set("firstScreen", "sign_in");
      if (email.trim()) {
        url.searchParams.set("login_hint", email.trim());
      }

      window.location.assign(url.toString());

      return {
        error: null,
        data: null,
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
    if (customerAuthMode === "disabled") {
      return {
        error: new Error(CUSTOMER_AUTH_UNAVAILABLE_MESSAGE),
        data: null,
      };
    }

    if (customerAuthMode === "logto") {
      const url = new URL("/api/auth/sign-in", window.location.origin);
      url.searchParams.set("next", "/hesap");
      url.searchParams.set("firstScreen", "register");
      if (email.trim()) {
        url.searchParams.set("login_hint", email.trim());
      }

      window.location.assign(url.toString());

      return {
        error: null,
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
    if (customerAuthMode === "disabled") {
      setSession(null);
      setUser(null);
      return { error: null };
    }

    if (customerAuthMode === "logto") {
      setSession(null);
      setUser(null);
      window.location.assign(
        `/api/auth/sign-out?next=${encodeURIComponent("/giris?next=/hesap&logged_out=1")}`,
      );
      return { error: null };
    }

    const { error } = await supabase.auth.signOut();
    return { error };
  };

  const resetPassword = async (email: string) => {
    if (customerAuthMode === "disabled") {
      return { error: new Error(CUSTOMER_AUTH_UNAVAILABLE_MESSAGE) };
    }

    if (customerAuthMode === "logto") {
      const url = new URL("/api/auth/sign-in", window.location.origin);
      url.searchParams.set("firstScreen", "reset_password");
      url.searchParams.set("identifier", "email");
      if (email.trim()) {
        url.searchParams.set("login_hint", email.trim());
      }

      window.location.assign(url.toString());
      return { error: null };
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: typeof window !== 'undefined' ? `${window.location.origin}/sifre-yenile` : undefined,
    });
    return { error };
  };

  const updatePassword = async (newPassword: string) => {
    if (customerAuthMode === "disabled") {
      return { error: new Error(CUSTOMER_AUTH_UNAVAILABLE_MESSAGE) };
    }

    if (customerAuthMode === "logto") {
      return {
        error: new Error("Sifre guncelleme guvenli hesap ekraninda tamamlanir."),
      };
    }

    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });
    return { error };
  };

  const refreshSession = async () => {
    if (customerAuthMode === "disabled") {
      setSession(null);
      setUser(null);
      return;
    }

    if (customerAuthMode === "logto") {
      try {
        const currentUser = await fetchLogtoSession();
        setSession(null);
        setUser(currentUser);
      } catch (error) {
        console.error("Error refreshing Logto customer session:", error);
        setSession(null);
        setUser(null);
      }
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
