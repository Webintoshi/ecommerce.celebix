"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowLeft, Loader2, Lock, Shield } from "lucide-react";
import { toast } from "sonner";
import { STORE_RUNTIME } from "@/lib/store-runtime";
import { getBrowserSupabaseClient } from "@/lib/supabase-browser";

export default function AdminLoginPage() {
  const router = useRouter();
  const supabase = useMemo(() => getBrowserSupabaseClient(), []);
  const [nextPath, setNextPath] = useState("/admin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let mounted = true;

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

    return () => {
      mounted = false;
    };
  }, [router, supabase]);

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
            <div className="w-16 h-16 rounded-xl flex items-center justify-center mx-auto mb-4 bg-primary">
              <Shield className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Admin Paneli</h1>
            <p className="text-sm text-gray-500">Atanmis yonetici hesabi ile giris yap.</p>
          </div>

          <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                Bu magazanin yonetici hesaplari <strong>Celebix Panel</strong> uzerinden atanir. Bu ekrandan yeni admin olusturulamaz.
              </p>
            </div>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">E-posta adresi</label>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder={STORE_RUNTIME.defaultAdminEmail}
                className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 transition-all focus:ring-primary/20 focus:border-primary"
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
                  className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 transition-all focus:ring-primary/20 focus:border-primary"
                  required
                  minLength={8}
                />
                <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full text-white py-3 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 bg-primary hover:bg-primary/90"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Giris yap"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
