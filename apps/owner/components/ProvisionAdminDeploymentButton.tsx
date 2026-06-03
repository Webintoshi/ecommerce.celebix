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
      setError(disabledReason || "Preview ortaminda yazma/kurulum islemleri kapalidir.");
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
            setError(errorMessage || "Admin deployment otomasyonu basarisiz oldu.");
            return;
          }

          setNotice(
            payload?.deployment?.status === "configured"
              ? "Admin deployment hazir ve runtime tutarli."
              : "Admin deployment guncellendi; runtime tutarliligi kontrol ediliyor.",
          );
          router.refresh();
        } catch (error) {
          setError(normalizeActionError(error, "Admin deployment otomasyonu basarisiz oldu."));
        }
      })();
    });
  }

  return (
    <div className="inline-stack">
      <button
        type="button"
        className="button button-secondary"
        onClick={handleProvision}
        disabled={disabled || isPending}
      >
        {isPending
          ? "Deploy hazirlaniyor..."
          : currentStatus === "configured"
            ? "Admin deployment'i yenile"
            : "Admin deployment'i kur"}
      </button>
      {error ? <p className="form-error">{error}</p> : null}
      {notice ? <p className="form-notice">{notice}</p> : null}
      {disabledReason ? <p className="form-notice">{disabledReason}</p> : null}
    </div>
  );
}
