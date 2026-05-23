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
        changed?: boolean;
        currentBranch?: string | null;
        desiredBranch?: string;
        deploymentTriggered?: boolean;
        error?: string;
      };

      if (!response.ok) {
        setError(payload.error || "Owner deployment branch onarimi basarisiz oldu.");
        return;
      }

      const current = payload.currentBranch || "bilinmiyor";
      const desired = payload.desiredBranch || "deploy/owner";
      setNotice(
        payload.changed
          ? `Owner branch ${current} yerine ${desired} olacak sekilde guncellendi. Deploy tetiklenmedi.`
          : `Owner branch zaten ${desired}. Deploy tetiklenmedi.`,
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
        {isPending ? "Owner branch onariliyor..." : "Owner branch'ini onar"}
      </button>
      {error ? <p className="form-error">{error}</p> : null}
      {notice ? <p className="form-notice">{notice}</p> : null}
    </div>
  );
}
