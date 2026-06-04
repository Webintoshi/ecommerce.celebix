"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

interface RepairAllStoreDeploymentAuthoritiesButtonProps {
  disabled?: boolean;
  disabledReason?: string;
}

export function RepairAllStoreDeploymentAuthoritiesButton({
  disabled = false,
  disabledReason,
}: RepairAllStoreDeploymentAuthoritiesButtonProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleRepair() {
    setError(null);
    setNotice(null);

    if (disabled) {
      setError(disabledReason || "Önizleme ortamında yazma ve kurulum işlemleri kapalıdır.");
      return;
    }

    startTransition(async () => {
      const response = await fetch("/api/operations/repair-store-deployment-authorities", {
        method: "POST",
      });
      const payload = (await response.json()) as {
        error?: string;
        totalStores?: number;
        changedStores?: number;
        failedStores?: number;
      };

      if (!response.ok) {
        setError(payload.error || "Mağaza yayın authority taraması başarısız oldu.");
        return;
      }

      setNotice(
        `${payload.totalStores ?? 0} mağaza tarandı. ${payload.changedStores ?? 0} mağaza onarıldı. ${payload.failedStores ?? 0} mağaza hata verdi.`,
      );
      router.refresh();
    });
  }

  return (
    <div className="inline-stack">
      <button
        type="button"
        className={`button button-secondary${disabledReason ? " button-preview-disabled" : ""}`}
        onClick={handleRepair}
        disabled={disabled || isPending}
      >
        {isPending ? "Tüm mağaza yayın ayarları taranıyor..." : "Tüm mağaza yayın ayarlarını onar"}
      </button>
      {error ? <p className="form-error">{error}</p> : null}
      {notice ? <p className="form-notice">{notice}</p> : null}
      {disabledReason ? <p className="form-notice form-notice-preview">{disabledReason}</p> : null}
    </div>
  );
}
