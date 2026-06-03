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
      setError(disabledReason || "Preview ortaminda yazma/kurulum islemleri kapalidir.");
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
        setError(payload.error || "Store deployment authority taramasi basarisiz oldu.");
        return;
      }

      setNotice(
        `${payload.totalStores ?? 0} store tarandi. ${payload.changedStores ?? 0} store onarildi. ${payload.failedStores ?? 0} store hata verdi.`,
      );
      router.refresh();
    });
  }

  return (
    <div className="inline-stack">
      <button
        type="button"
        className="button button-secondary"
        onClick={handleRepair}
        disabled={disabled || isPending}
      >
        {isPending ? "Tum store authority ayarlari taraniyor..." : "Tum store deploy ayarlarini onar"}
      </button>
      {error ? <p className="form-error">{error}</p> : null}
      {notice ? <p className="form-notice">{notice}</p> : null}
      {disabledReason ? <p className="form-notice">{disabledReason}</p> : null}
    </div>
  );
}
