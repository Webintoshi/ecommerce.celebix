"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

interface RepairStoreDeploymentAuthorityButtonProps {
  slug: string;
  disabled?: boolean;
  disabledReason?: string;
}

export function RepairStoreDeploymentAuthorityButton({
  slug,
  disabled = false,
  disabledReason,
}: RepairStoreDeploymentAuthorityButtonProps) {
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
      const response = await fetch(`/api/stores/${slug}/repair-deployment-authority`, {
        method: "POST",
      });
      const payload = (await response.json()) as {
        error?: string;
        changed?: boolean;
        deploymentTriggered?: boolean;
        targets?: Array<{
          target: "admin" | "storefront";
          status: "repaired" | "already_configured" | "missing";
          branchChanged: boolean;
          autoDeployChanged: boolean;
          desiredBranch: string;
        }>;
      };

      if (!response.ok) {
        setError(payload.error || "Yayın authority onarımı başarısız oldu.");
        return;
      }

      const repairedTargets =
        payload.targets?.filter((target) => target.status === "repaired").map((target) => {
          const changeSet = [
            target.branchChanged ? `branch ${target.desiredBranch}` : null,
            target.autoDeployChanged ? "auto deploy" : null,
          ].filter(Boolean);
          return `${target.target}: ${changeSet.join(" + ") || "ayar"} onarıldı`;
        }) ?? [];
      const missingTargets =
        payload.targets?.filter((target) => target.status === "missing").map((target) => target.target) ?? [];
      const stableTargets =
        payload.targets?.filter((target) => target.status === "already_configured").map((target) => target.target) ?? [];

      const fragments = [
        repairedTargets.join(", "),
        stableTargets.length > 0 ? `${stableTargets.join(", ")} zaten doğru ayarda.` : null,
        missingTargets.length > 0 ? `${missingTargets.join(", ")} resource'u Coolify'da bulunamadı.` : null,
        payload.deploymentTriggered ? "Redeploy tetiklendi." : null,
      ].filter(Boolean);

      setNotice(
        fragments.join(" ") || "Yayın authority ayarları kontrol edildi.",
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
        {isPending ? "Yayın authority onarılıyor..." : "Yayın authority'yi onar"}
      </button>
      {error ? <p className="form-error">{error}</p> : null}
      {notice ? <p className="form-notice">{notice}</p> : null}
      {disabledReason ? <p className="form-notice form-notice-preview">{disabledReason}</p> : null}
    </div>
  );
}
