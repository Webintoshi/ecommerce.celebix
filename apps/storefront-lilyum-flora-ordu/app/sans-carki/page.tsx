"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import SpinForm from "@/components/lucky-wheel/SpinForm";

const LuckyWheel = dynamic(() => import("@/components/lucky-wheel/LuckyWheel"), { ssr: false });

interface PublicPrize {
  id: string;
  name: string;
  description?: string | null;
  prize_type: "coupon" | "none";
  color_hex: string;
  icon_emoji?: string | null;
  image_url?: string | null;
  display_order: number;
}

interface PublicConfig {
  id: string;
  name: string;
  is_active: boolean;
  wheel_segments: number;
  primary_color: string;
  secondary_color: string;
  require_membership: boolean;
  require_email_verified: boolean;
  start_date?: string | null;
  end_date?: string | null;
}

interface SpinOutcome {
  spinId: string;
  prizeId: string;
  prizeName: string;
  isWinner: boolean;
  couponCode: string | null;
  message: string;
}

export default function LuckyWheelPage() {
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [prizes, setPrizes] = useState<PublicPrize[]>([]);
  const [loading, setLoading] = useState(true);
  const [spinLoading, setSpinLoading] = useState(false);
  const [fingerprint, setFingerprint] = useState("");
  const [canSpin, setCanSpin] = useState(true);
  const [remainingSpins, setRemainingSpins] = useState(0);
  const [spinAnimation, setSpinAnimation] = useState<{ spinId: string; prizeId: string } | null>(null);
  const [latestOutcome, setLatestOutcome] = useState<SpinOutcome | null>(null);
  const [showOutcome, setShowOutcome] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("wheel_fingerprint");
    const value = stored || `fp-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
    localStorage.setItem("wheel_fingerprint", value);
    setFingerprint(value);
    void fetchWheelData();
  }, []);

  const fetchWheelData = async () => {
    try {
      const response = await fetch("/api/lucky-wheel", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result?.error || "Şans çarkı yüklenemedi.");
      }

      setConfig(result.config as PublicConfig);
      setPrizes((result.prizes || []) as PublicPrize[]);
      setCanSpin(Boolean(result.config?.is_active));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Şans çarkı yüklenemedi.");
    } finally {
      setLoading(false);
    }
  };

  const checkEligibility = async (userEmail?: string, userPhone?: string) => {
    const response = await fetch("/api/lucky-wheel/eligibility", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        configId: config?.id,
        userEmail,
        userPhone,
        fingerprint,
      }),
    });
    const result = await response.json();
    if (!response.ok || !result.success) {
      throw new Error(result?.error || "Uygunluk kontrolü başarısız.");
    }

    setCanSpin(Boolean(result.canSpin));
    setRemainingSpins(Number(result.spinsRemaining || 0));
    if (!result.canSpin) {
      throw new Error(result.reason || "Şu an spin hakkınız bulunmuyor.");
    }
  };

  const handleSpin = async (userData: { userName: string; userEmail?: string; userPhone?: string }) => {
    if (!config) return;

    setSpinLoading(true);
    try {
      await checkEligibility(userData.userEmail, userData.userPhone);

      const idempotencyKey = crypto.randomUUID();
      const response = await fetch("/api/lucky-wheel/spins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          configId: config.id,
          userName: userData.userName,
          userEmail: userData.userEmail,
          userPhone: userData.userPhone,
          fingerprint,
          idempotencyKey,
        }),
      });

      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result?.message || result?.error || "Spin işlemi başarısız.");
      }

      const spinId = result?.spin?.id as string | undefined;
      const prizeId = result?.prize?.id as string | undefined;
      if (!spinId || !prizeId) {
        throw new Error("Spin sonucu okunamadı.");
      }

      setRemainingSpins(Number(result.remainingSpins || 0));
      setLatestOutcome({
        spinId,
        prizeId,
        prizeName: result?.prize?.name || "Ödül",
        isWinner: Boolean(result?.spin?.is_winner),
        couponCode: result?.couponCode || null,
        message: result?.message || "Spin tamamlandı.",
      });
      setShowOutcome(false);
      setSpinAnimation({ spinId, prizeId });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Spin hatası.");
    } finally {
      setSpinLoading(false);
    }
  };

  const handleAnimationComplete = () => {
    if (!latestOutcome) return;
    setShowOutcome(true);
    if (latestOutcome.isWinner) {
      toast.success(latestOutcome.message);
    } else {
      toast(latestOutcome.message);
    }
  };

  const copyCoupon = async () => {
    if (!latestOutcome?.couponCode) return;
    await navigator.clipboard.writeText(latestOutcome.couponCode);
    toast.success("Kupon kodu kopyalandı.");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 to-red-50 flex items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-16 w-16 animate-spin rounded-full border-4 border-orange-500 border-t-transparent" />
          <p className="text-gray-600">Şans çarkı yükleniyor...</p>
        </div>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 to-red-50 flex items-center justify-center p-4">
        <div className="max-w-md rounded-3xl bg-white p-8 text-center shadow-xl">
          <div className="mb-4 text-6xl">🎡</div>
          <h1 className="mb-2 text-2xl font-bold text-gray-900">Şans Çarkı</h1>
          <p className="text-gray-600">Şu anda aktif bir şans çarkı bulunmuyor.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-red-50 px-4 py-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 text-center">
          <h1 className="mb-2 text-4xl font-bold text-gray-900">{config.name}</h1>
          <p className="text-gray-600">Formu doldur, spin at ve anında kuponunu kazan.</p>
          <p className="mt-2 text-sm text-gray-500">Kalan spin hakkı: {remainingSpins}</p>
        </div>

        <div className="grid items-start gap-8 md:grid-cols-2">
          <div className="flex justify-center">
            <LuckyWheel config={config} prizes={prizes} spinAnimation={spinAnimation} onSpinAnimationComplete={handleAnimationComplete} />
          </div>

          <div className="rounded-3xl bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-xl font-bold text-gray-900">Katılım Formu</h2>
            <SpinForm
              onSubmit={handleSpin}
              requireEmail={config.require_membership}
              requirePhone={config.require_membership}
              isLoading={spinLoading || !canSpin}
            />

            {!canSpin && <p className="mt-3 text-sm text-red-600">Şu an spin hakkınız bulunmuyor.</p>}

            {showOutcome && latestOutcome && (
              <div className="mt-6 rounded-2xl border border-gray-200 bg-gray-50 p-4">
                <h3 className="text-lg font-semibold text-gray-900">{latestOutcome.prizeName}</h3>
                <p className="mt-1 text-sm text-gray-600">{latestOutcome.message}</p>
                {latestOutcome.couponCode && (
                  <div className="mt-3 flex items-center gap-2">
                    <code className="rounded-lg bg-white px-3 py-2 font-mono text-sm text-gray-800">{latestOutcome.couponCode}</code>
                    <button onClick={copyCoupon} className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-100">
                      <Copy className="h-4 w-4" />
                      Kopyala
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {config.start_date && config.end_date && (
          <p className="mt-8 text-center text-sm text-gray-500">
            Kampanya {new Date(config.start_date).toLocaleDateString("tr-TR")} - {new Date(config.end_date).toLocaleDateString("tr-TR")} tarihleri arasında geçerlidir.
          </p>
        )}
      </div>
    </div>
  );
}
