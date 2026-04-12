"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

interface DeleteStoreButtonProps {
  slug: string;
  name: string;
}

interface CleanupTargetResult {
  type: string;
  identifier: string;
  status: "deleted" | "missing" | "failed" | "skipped";
  message?: string | null;
}

export function DeleteStoreButton({ slug, name }: DeleteStoreButtonProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [confirmSlug, setConfirmSlug] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<CleanupTargetResult[]>([]);
  const [isPending, startTransition] = useTransition();

  const isConfirmed = useMemo(
    () => confirmSlug.trim().toLocaleLowerCase("tr") === slug.toLocaleLowerCase("tr"),
    [confirmSlug, slug],
  );

  function resetState() {
    setConfirmSlug("");
    setError(null);
    setDetails([]);
  }

  function handleClose(force = false) {
    if (isPending && !force) {
      return;
    }

    resetState();
    setIsOpen(false);
  }

  function handleDelete() {
    if (!isConfirmed) {
      setError("Devam etmek icin proje slug bilgisini eksiksiz gir.");
      return;
    }

    setError(null);
    setDetails([]);

    startTransition(async () => {
      try {
        const response = await fetch(`/api/stores/${slug}`, {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            confirmSlug,
          }),
        });

        const payload = (await response.json()) as {
          error?: string;
          result?: { targets?: CleanupTargetResult[] };
        };

        if (!response.ok) {
          setError(payload.error || "Proje silme islemi basarisiz oldu.");
          setDetails(payload.result?.targets ?? []);
          return;
        }

        handleClose(true);
        router.push("/stores");
        router.refresh();
      } catch (error) {
        setError(error instanceof Error ? error.message : "Proje silme istegi tamamlanamadi.");
      }
    });
  }

  return (
    <>
      <Button variant="danger" onClick={() => setIsOpen(true)}>
        Projeyi sil
      </Button>

      <Dialog
        isOpen={isOpen}
        onClose={handleClose}
        size="md"
        title={`${name} projesini sil`}
        description="Bu islem admin, storefront, Supabase, R2 ve owner kaydini temizlemeyi dener. Geri alinmaz."
        footer={
          <>
            <Button variant="ghost" onClick={() => handleClose()} disabled={isPending}>
              Vazgec
            </Button>
            <Button variant="danger" onClick={handleDelete} disabled={!isConfirmed} isLoading={isPending}>
              Projeyi kalici sil
            </Button>
          </>
        }
      >
        <div className="field">
          <span>Onay icin proje slug bilgisini yaz</span>
          <input
            value={confirmSlug}
            onChange={(event) => setConfirmSlug(event.target.value)}
            placeholder={slug}
            autoComplete="off"
          />
          <small>
            Bu proje silinirse owner kaydi, bagli deploymentlar ve altyapi kaynaklari kaldirilir.
          </small>
        </div>

        {error ? <p className="form-error stack-top-sm">{error}</p> : null}

        {details.length > 0 ? (
          <div className="stack-list stack-top-md">
            {details.map((detail, index) => (
              <div key={`${detail.type}-${detail.identifier}-${index}`} className="inline-card">
                <div>
                  <strong>{detail.type}</strong>
                  <p>{detail.identifier}</p>
                </div>
                <div className="activity-meta">
                  <span>{detail.status}</span>
                  <span>{detail.message || "-"}</span>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </Dialog>
    </>
  );
}
