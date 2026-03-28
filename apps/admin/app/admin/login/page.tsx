"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Lock, Shield, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { STORE_RUNTIME } from "@/lib/store-runtime";
import { getBrowserSupabaseClient } from "@/lib/supabase-browser";

interface BootstrapState {
  isFirstUser: boolean;
}

export default function AdminLoginPage() {
  const router = useRouter();
  const supabase = useMemo(() => getBrowserSupabaseClient(), []);
  const [nextPath, setNextPath] = useState("/admin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [isSetupMode, setIsSetupMode] = useState(false);
  const [bootstrapState, setBootstrapState] = useState<BootstrapState | null>(null);

  useEffect(() => {
    let mounted = true;

    const loadBootstrapState = async () => {
      try {
        const response = await fetch("/api/admin/users?bootstrap=1", { cache: "no-store" });
        const payload = (await response.json()) as { success?: boolean; isFirstUser?: boolean };

        if (!mounted) {
          return;
        }

        const isFirstUser = Boolean(payload.success && payload.isFirstUser);
        setBootstrapState({ isFirstUser });
        setIsSetupMode(isFirstUser);
      } catch {
        if (mounted) {
          setBootstrapState({ isFirstUser: false });
        }
      }
    };

    const redirectIfAuthenticated = async () => {
      const next = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("next") || "/admin" : "/admin";
      if (mounted) {
        setNextPath(next);
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (mounted && user) {
        router.replace(next);
      }
    };

    redirectIfAuthenticated();
    loadBootstrapState();

    return () => {
      mounted = false;
    };
  }, [nextPath, router, supabase]);

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        toast.error(`Giris basarisiz: ${error.message}`);
        return;
      }

      toast.success("Giris yapildi.");
      router.replace(nextPath);
      router.refresh();
    } catch (error) {
      console.error("Admin login error:", error);
      toast.error("Beklenmeyen bir hata olustu.");
    } finally {
      setLoading(false);
    }
  };

  const handleSetup = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);

    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          password,
          fullName,
          role: "super_admin",
          taskDefinition: "Sistem Kurucusu",
        }),
      });

      const payload = (await response.json()) as { success?: boolean; error?: string; message?: string };

      if (!response.ok || !payload.success) {
        toast.error(payload.error || "Kurulum basarisiz.");
        return;
      }

      toast.success(payload.message || "Ilk yonetici olusturuldu. Simdi giris yapabilirsin.");
      setIsSetupMode(false);
      setBootstrapState({ isFirstUser: false });
    } catch (error) {
      console.error("Admin setup error:", error);
      toast.error("Baglanti hatasi olustu.");
    } finally {
      setLoading(false);
    }
  };

  const showSetupSwitch = bootstrapState?.isFirstUser === true;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Link
          href={STORE_RUNTIME.storefrontUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Ana sayfaya don
        </Link>

        <div className="bg-white rounded-2xl shadow-lg p-8 relative overflow-hidden">
          <div className="text-center mb-8">
            <div className={`w-16 h-16 rounded-xl flex items-center justify-center mx-auto mb-4 transition-colors ${isSetupMode ? "bg-gray-900" : "bg-primary"}`}>
              {isSetupMode ? <UserPlus className="w-8 h-8 text-white" /> : <Shield className="w-8 h-8 text-white" />}
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">{isSetupMode ? "Ilk yonetici kurulumu" : "Admin Paneli"}</h1>
            <p className="text-sm text-gray-500">
              {isSetupMode ? "Bu magaza icin ilk admin kullanicisini olustur." : "Supabase oturumu ile guvenli giris yap."}
            </p>
          </div>

          {showSetupSwitch ? (
            <div className="flex gap-3 mb-6">
              <button
                type="button"
                className={`button ${!isSetupMode ? "button-primary" : "button-secondary"} flex-1`}
                onClick={() => setIsSetupMode(false)}
              >
                Giris yap
              </button>
              <button
                type="button"
                className={`button ${isSetupMode ? "button-primary" : "button-secondary"} flex-1`}
                onClick={() => setIsSetupMode(true)}
              >
                Kurulum
              </button>
            </div>
          ) : null}

          <form onSubmit={isSetupMode ? handleSetup : handleLogin} className="space-y-4">
            {isSetupMode ? (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ad soyad</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  placeholder="Celebix Yonetici"
                  className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900/20 focus:border-gray-900 transition-all"
                  required
                />
              </div>
            ) : null}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">E-posta adresi</label>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder={STORE_RUNTIME.defaultAdminEmail}
                className={`w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 transition-all ${isSetupMode ? "focus:ring-gray-900/20 focus:border-gray-900" : "focus:ring-primary/20 focus:border-primary"}`}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Sifre</label>
              <div className="relative">
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="En az 8 karakter"
                  className={`w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 transition-all ${isSetupMode ? "focus:ring-gray-900/20 focus:border-gray-900" : "focus:ring-primary/20 focus:border-primary"}`}
                  required
                  minLength={8}
                />
                <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className={`w-full text-white py-3 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${isSetupMode ? "bg-gray-900 hover:bg-gray-800" : "bg-primary hover:bg-primary/90"}`}
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : isSetupMode ? "Yoneticiyi olustur" : "Giris yap"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
