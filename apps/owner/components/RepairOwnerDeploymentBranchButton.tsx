"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function RepairOwnerDeploymentBranchButton() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleRepair() {
    setError(null);
    setNotice(null);

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
        setError(payload.error || "Owner deployment branch onarimi basarisiz oldu.");
        return;
      }

      const current = payload.currentBranch || "bilinmiyor";
      const desired = payload.desiredBranch || "deploy/owner";
      const branchNotice = payload.branchChanged
        ? `Owner branch ${current} yerine ${desired} olacak sekilde guncellendi.`
        : `Owner branch zaten ${desired}.`;
      const autoDeployNotice = payload.autoDeployChanged
        ? "Auto deploy yeniden acildi."
        : payload.currentAutoDeployEnabled === true
          ? "Auto deploy zaten acik."
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
        className="button button-secondary"
        onClick={handleRepair}
        disabled={isPending}
      >
        {isPending ? "Owner deploy ayari onariliyor..." : "Owner deploy ayarini onar"}
      </button>
      {error ? <p className="form-error">{error}</p> : null}
      {notice ? <p className="form-notice">{notice}</p> : null}
    </div>
  );
}
