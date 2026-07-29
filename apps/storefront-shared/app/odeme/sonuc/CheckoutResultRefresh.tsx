"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { nextCheckoutResultRefreshAttempt } from "@/components/checkout/result-refresh.ts";

const REFRESH_INTERVAL_MS = 2_500;

export function CheckoutResultRefresh() {
  const router = useRouter();
  const attempts = useRef(0);
  const [automaticComplete, setAutomaticComplete] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      if (cancelled) return;
      const next = nextCheckoutResultRefreshAttempt(attempts.current);
      if (next === null) {
        setAutomaticComplete(true);
        return;
      }
      attempts.current = next;
      startTransition(() => router.refresh());
      if (nextCheckoutResultRefreshAttempt(next) === null) {
        setAutomaticComplete(true);
        return;
      }
      timer = setTimeout(refresh, REFRESH_INTERVAL_MS);
    };
    timer = setTimeout(refresh, REFRESH_INTERVAL_MS);
    return () => {
      cancelled = true;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [router]);

  return <div className="checkout-result-refresh">
    <p aria-live="polite">
      {pending
        ? "Ödeme durumu yenileniyor."
        : automaticComplete
          ? "Otomatik doğrulama tamamlandı. Gerekirse durumu yeniden kontrol edebilirsiniz."
          : "Ödeme sağlayıcısından güvenli doğrulama bekleniyor."}
    </p>
    <button
      disabled={pending}
      onClick={() => startTransition(() => router.refresh())}
      type="button"
    >
      Durumu yenile
    </button>
  </div>;
}
