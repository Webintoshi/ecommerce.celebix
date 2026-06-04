"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

interface RepairOwnerDeploymentBranchButtonProps {
  disabled?: boolean;
  disabledReason?: string;
}

export function RepairOwnerDeploymentBranchButton({
  disabled = false,
  disabledReason,
}: RepairOwnerDeploymentBranchButtonProps) {
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
      const response = await fetch("/api/operations/repair-owner-deployment-branch", {
        method: "POST",
      });
      const payload = (await response.json()) as {
        autoDeployChanged?: boolean;
        branchChanged?: boolean;
        changed?: boolean;
        currentBranch?: string | null;
        currentAutoDeployEnabled?: boolean | null;
        desiredBranch?: string;
        desiredAutoDeployEnabled?: boolean;
        deploymentTriggered?: boolean;
        error?: string;
      };

      if (!response.ok) {
        setError(payload.error || "Owner yayın branch onarımı başarısız oldu.");
        return;
      }

      const current = payload.currentBranch || "bilinmiyor";
      const desired = payload.desiredBranch || "deploy/owner";
      const branchNotice = payload.branchChanged
        ? `Owner branch ${current} yerine ${desired} olacak şekilde güncellendi.`
        : `Owner branch zaten ${desired}.`;
      const autoDeployNotice = payload.autoDeployChanged
        ? "Auto deploy yeniden açıldı."
        : payload.currentAutoDeployEnabled === true
          ? "Auto deploy zaten açık."
          : "Auto deploy durumu teyit edilemedi.";
      const deployNotice = payload.deploymentTriggered
        ? "Redeploy tetiklendi."
        : "Redeploy tetiklenmedi.";

      setNotice(
        `${branchNotice} ${autoDeployNotice} ${deployNotice}`,
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
        {isPending ? "Owner yayın ayarı onarılıyor..." : "Owner yayın ayarını onar"}
      </button>
      {error ? <p className="form-error">{error}</p> : null}
      {notice ? <p className="form-notice">{notice}</p> : null}
      {disabledReason ? <p className="form-notice form-notice-preview">{disabledReason}</p> : null}
    </div>
  );
}
