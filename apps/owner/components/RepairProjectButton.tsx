"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { normalizeActionError, readActionResponse } from "@/components/action-request";

interface ProvisioningStepSummary {
  key: string;
  status: string;
  message: string | null;
}

interface RepairProjectButtonProps {
  slug: string;
  disabled?: boolean;
  disabledReason?: string;
}

export function RepairProjectButton({
  slug,
  disabled = false,
  disabledReason,
}: RepairProjectButtonProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [details, setDetails] = useState<ProvisioningStepSummary[]>([]);
  const [isPending, startTransition] = useTransition();

  function handleRepair() {
    setError(null);
    setNotice(null);
    setDetails([]);

    if (disabled) {
      setError(disabledReason || "Önizleme ortamında yazma ve kurulum işlemleri kapalıdır.");
      return;
    }

    startTransition(() => {
      void (async () => {
        try {
          const response = await fetch(`/api/stores/${slug}/repair`, {
            method: "POST",
          });
          const { payload, errorMessage } = await readActionResponse<{
            error?: string;
            success?: boolean;
            provisioningState?: string;
            blockers?: ProvisioningStepSummary[];
            steps?: ProvisioningStepSummary[];
          }>(response);

          if (!response.ok) {
            setError(errorMessage || "Onarım akışı başarısız oldu.");
            return;
          }

          setDetails(payload?.steps ?? []);
          setNotice(
            payload?.provisioningState === "ready"
              ? "Onarım akışı tamamlandı; kurulum durumu hazır."
              : "Onarım akışı çalıştı; kalan blokajlar aşağıda listelendi.",
          );

          if (payload?.provisioningState !== "ready") {
            setError(
              payload?.blockers
                ?.map((step) => step.message)
                .filter((value): value is string => Boolean(value))
                .join(" / ") || "Kurulum hâlâ pending_repair durumunda.",
            );
          }

          router.refresh();
        } catch (error) {
          setError(normalizeActionError(error, "Onarım akışı başarısız oldu."));
        }
      })();
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
        {isPending ? "Onarım çalışıyor..." : "Mağazayı onar"}
      </button>
      {error ? <p className="form-error">{error}</p> : null}
      {notice ? <p className="form-notice">{notice}</p> : null}
      {disabledReason ? <p className="form-notice form-notice-preview">{disabledReason}</p> : null}
      {details.length > 0 ? (
        <div className="stack-list stack-top-sm">
          {details
            .filter((step) => step.status === "failed" || step.status === "pending")
            .slice(0, 5)
            .map((step) => (
              <div key={step.key} className="inline-card">
                <strong>{step.key}</strong>
                <p>{step.message || step.status}</p>
              </div>
            ))}
        </div>
      ) : null}
    </div>
  );
}
