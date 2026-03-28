"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, Shield, ArrowLeft, Loader2, UserPlus } from "lucide-react";
import Link from "next/link";
import { STORE_RUNTIME } from "@/lib/store-runtime";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  // Setup Mode State
  const [isSetupMode, setIsSetupMode] = useState(false);
  const [fullName, setFullName] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        toast.error("Giriş başarısız: " + error.message);
      } else {
        toast.success("Giriş yapıldı.");
        
        // Get user info and store in localStorage
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          // Store user info for sidebar
          localStorage.setItem("admin_authenticated", "true");
          localStorage.setItem("admin_user_id", user.id);
          localStorage.setItem("admin_user_email", user.email || "");
          
          // Try to get full name from metadata
          const fullName = user.user_metadata?.full_name || 
                          user.user_metadata?.name || 
                          "";
          if (fullName) {
            localStorage.setItem("admin_user_name", fullName);
          }
        }
        
        router.push("/admin");
        router.refresh();
      }
    } catch (error) {
      console.error("Login Error:", error);
      toast.error("Bir hata oluştu.");
    } finally {
      setLoading(false);
    }
  };

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          fullName,
          role: "super_admin", // API enforces this for first user anyway
          taskDefinition: "Sistem Kurucusu"
        })
      });

      const data = await res.json();

      if (data.success) {
        toast.success("Yönetici oluşturuldu! Şimdi giriş yapabilirsiniz.");
        setIsSetupMode(false);
      } else {
        toast.error(data.error || "Kurulum başarısız.");
      }
    } catch (error) {
      console.error("Setup Error:", error);
      toast.error("Bağlantı hatası.");
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
          Ana Sayfaya Dön
        </Link>

        <div className="bg-white rounded-2xl shadow-lg p-8 relative overflow-hidden">
          <div className="text-center mb-8">
            <div className={`w-16 h-16 rounded-xl flex items-center justify-center mx-auto mb-4 transition-colors ${isSetupMode ? "bg-gray-900" : "bg-primary"}`}>
              {isSetupMode ? <UserPlus className="w-8 h-8 text-white" /> : <Shield className="w-8 h-8 text-white" />}
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              {isSetupMode ? "İlk Yönetici Kurulumu" : "Admin Paneli"}
            </h1>
            <p className="text-sm text-gray-500">
              {isSetupMode
                ? "Sistemin ilk yöneticisini oluşturun."
                : "Güvenli erişim için giriş yapın."}
            </p>
          </div>

          <form onSubmit={isSetupMode ? handleSetup : handleLogin} className="space-y-4">
            {isSetupMode && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Ad Soyad
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Adınız Soyadınız"
                  className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900/20 focus:border-gray-900 transition-all"
                  required={isSetupMode}
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                E-posta Adresi
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={STORE_RUNTIME.defaultAdminEmail}
                className={`w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 transition-all ${isSetupMode ? "focus:ring-gray-900/20 focus:border-gray-900" : "focus:ring-primary/20 focus:border-primary"
                  }`}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Şifre
              </label>
              <div className="relative">
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className={`w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 transition-all ${isSetupMode ? "focus:ring-gray-900/20 focus:border-gray-900" : "focus:ring-primary/20 focus:border-primary"
                    }`}
                  required
                  minLength={6}
                />
                <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className={`w-full text-white py-3 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${isSetupMode ? "bg-gray-900 hover:bg-gray-800" : "bg-primary hover:bg-primary/90"
                }`}
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                isSetupMode ? "Yöneticiyi Oluştur" : "Giriş Yap"
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            {/* Setup mode button removed as per user request */}
          </div>
        </div>
      </div>
    </div>
  );
}
