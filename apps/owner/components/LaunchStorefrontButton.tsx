"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { normalizeActionError, readActionResponse } from "@/components/action-request";

interface LaunchStorefrontButtonProps {
  slug: string;
  currentStatus: "not_started" | "scaffolded" | "active";
  disabled?: boolean;
  disabledReason?: string;
}

export function LaunchStorefrontButton({
  slug,
  currentStatus,
  disabled = false,
  disabledReason,
}: LaunchStorefrontButtonProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleLaunch() {
    setError(null);
    setNotice(null);

    if (disabled) {
      setError(disabledReason || "Önizleme ortamında yazma ve kurulum işlemleri kapalıdır.");
      return;
    }

    startTransition(() => {
      void (async () => {
        try {
          const response = await fetch(`/api/stores/${slug}/storefront`, {
            method: "POST"
          });

          const { payload, errorMessage } = await readActionResponse<{
            error?: string;
            deployment?: { status?: string; message?: string | null };
          }>(response);

          if (!response.ok) {
            setError(errorMessage || "Vitrin yayın otomasyonu başarısız oldu.");
            return;
          }

          setNotice(
            payload?.deployment?.status === "configured"
              ? "Vitrin yayını hazır ve runtime tutarlı."
              : payload?.deployment?.message ||
                  "Vitrin hazırlandı; yayın durumu owner panelinden izlenebilir.",
          );
          router.refresh();
        } catch (error) {
          setError(normalizeActionError(error, "Vitrin yayın otomasyonu başarısız oldu."));
        }
      })();
    });
  }

  return (
    <div className="inline-stack">
      <button
        type="button"
        className={`button button-primary${disabledReason ? " button-preview-disabled" : ""}`}
        onClick={handleLaunch}
        disabled={disabled || isPending}
      >
        {isPending
          ? "Vitrin yayını hazırlanıyor..."
          : currentStatus === "not_started"
            ? "Vitrini kur"
            : "Vitrin yayınını yenile"}
      </button>
      {error ? <p className="form-error">{error}</p> : null}
      {notice ? <p className="form-notice">{notice}</p> : null}
      {disabledReason ? <p className="form-notice form-notice-preview">{disabledReason}</p> : null}
    </div>
  );
}
