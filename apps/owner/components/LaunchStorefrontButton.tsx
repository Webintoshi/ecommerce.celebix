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
  const [isPending, startTransition] = useTransition();

  function handleLaunch() {
    setError(null);

    startTransition(async () => {
      const response = await fetch(`/api/stores/${slug}/storefront`, {
        method: "POST"
      });

      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(payload.error || "Storefront klasoru olusturulamadi.");
        return;
      }

      router.refresh();
    });
  }

  return (
    <div className="inline-stack">
      <button type="button" className="button button-primary" onClick={handleLaunch} disabled={isPending}>
        {isPending
          ? "Klasor olusuyor..."
          : currentStatus === "not_started"
            ? "Proje Baslat"
            : "Storefront klasorunu guncelle"}
      </button>
      {error ? <p className="form-error">{error}</p> : null}
    </div>
  );
}
