"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

interface LaunchStorefrontButtonProps {
  slug: string;
  currentStatus: "not_started" | "scaffolded" | "active";
}

export function LaunchStorefrontButton({ slug, currentStatus }: LaunchStorefrontButtonProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleLaunch() {
    setError(null);
    setNotice(null);

    startTransition(async () => {
      const response = await fetch(`/api/stores/${slug}/storefront`, {
        method: "POST"
      });

      const payload = (await response.json()) as {
        error?: string;
        deployment?: { status?: string; message?: string | null };
      };

      if (!response.ok) {
        setError(payload.error || "Storefront deployment otomasyonu basarisiz oldu.");
        return;
      }

      setNotice(
        payload.deployment?.status === "configured"
          ? "Storefront deployment hazir ve runtime tutarli."
          : payload.deployment?.message ||
              "Storefront hazirlandi; deployment durumu owner panelinden izlenebilir.",
      );
      router.refresh();
    });
  }

  return (
    <div className="inline-stack">
      <button type="button" className="button button-primary" onClick={handleLaunch} disabled={isPending}>
        {isPending
          ? "Storefront deploy ediliyor..."
          : currentStatus === "not_started"
            ? "Storefront'u kur"
            : "Storefront deployment'ini yenile"}
      </button>
      {error ? <p className="form-error">{error}</p> : null}
      {notice ? <p className="form-notice">{notice}</p> : null}
    </div>
  );
}
