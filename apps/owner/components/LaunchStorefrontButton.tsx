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
      setError(disabledReason || "Preview ortaminda yazma/kurulum islemleri kapalidir.");
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
            setError(errorMessage || "Storefront deployment otomasyonu basarisiz oldu.");
            return;
          }

          setNotice(
            payload?.deployment?.status === "configured"
              ? "Storefront deployment hazir ve runtime tutarli."
              : payload?.deployment?.message ||
                  "Storefront hazirlandi; deployment durumu owner panelinden izlenebilir.",
          );
          router.refresh();
        } catch (error) {
          setError(normalizeActionError(error, "Storefront deployment otomasyonu basarisiz oldu."));
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
          ? "Storefront deploy ediliyor..."
          : currentStatus === "not_started"
            ? "Storefront'u kur"
            : "Storefront deployment'ini yenile"}
      </button>
      {error ? <p className="form-error">{error}</p> : null}
      {notice ? <p className="form-notice">{notice}</p> : null}
      {disabledReason ? <p className="form-notice form-notice-preview">{disabledReason}</p> : null}
    </div>
  );
}
