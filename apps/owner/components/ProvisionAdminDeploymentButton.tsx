"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { normalizeActionError, readActionResponse } from "@/components/action-request";

interface ProvisionAdminDeploymentButtonProps {
  slug: string;
  currentStatus: "pending-owner-env" | "prepared" | "configured" | "failed";
  disabled?: boolean;
  disabledReason?: string;
}

export function ProvisionAdminDeploymentButton({
  slug,
  currentStatus,
  disabled = false,
  disabledReason,
}: ProvisionAdminDeploymentButtonProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleProvision() {
    setError(null);
    setNotice(null);

    if (disabled) {
      setError(disabledReason || "Önizleme ortamında yazma ve kurulum işlemleri kapalıdır.");
      return;
    }

    startTransition(() => {
      void (async () => {
        try {
          const response = await fetch(`/api/stores/${slug}/provision-admin`, {
            method: "POST",
          });

          const { payload, errorMessage } = await readActionResponse<{
            error?: string;
            deployment?: { status?: string };
          }>(response);

          if (!response.ok) {
            setError(errorMessage || "Admin yayın otomasyonu başarısız oldu.");
            return;
          }

          setNotice(
            payload?.deployment?.status === "configured"
              ? "Admin yayını hazır ve runtime tutarlı."
              : "Admin yayını güncellendi; runtime tutarlılığı kontrol ediliyor.",
          );
          router.refresh();
        } catch (error) {
          setError(normalizeActionError(error, "Admin yayın otomasyonu başarısız oldu."));
        }
      })();
    });
  }

  return (
    <div className="inline-stack">
      <button
        type="button"
        className={`button button-secondary${disabledReason ? " button-preview-disabled" : ""}`}
        onClick={handleProvision}
        disabled={disabled || isPending}
      >
        {isPending
          ? "Yayın hazırlanıyor..."
          : currentStatus === "configured"
            ? "Admin yayınını yenile"
            : "Admin yayınını kur"}
      </button>
      {error ? <p className="form-error">{error}</p> : null}
      {notice ? <p className="form-notice">{notice}</p> : null}
      {disabledReason ? <p className="form-notice form-notice-preview">{disabledReason}</p> : null}
    </div>
  );
}
