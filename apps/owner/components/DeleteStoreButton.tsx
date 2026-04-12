"use client";

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
  const [isOpen, setIsOpen] = useState(false);
  const [confirmationValue, setConfirmationValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<CleanupTargetResult[]>([]);
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();

  const isConfirmed = useMemo(
    () => confirmationValue.trim().toLocaleLowerCase("tr") === slug.toLocaleLowerCase("tr"),
    [confirmationValue, slug],
  );

  function resetState() {
    setConfirmationValue("");
    setError(null);
    setDetails([]);
    setCopied(false);
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
      setError("Devam etmek icin asagidaki slug bilgisini aynen gir veya tek tikla doldur.");
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
            confirmSlug: confirmationValue,
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
        window.location.assign("/stores");
      } catch (error) {
        setError(error instanceof Error ? error.message : "Proje silme istegi tamamlanamadi.");
      }
    });
  }

  async function handleCopySlug() {
    try {
      await navigator.clipboard.writeText(slug);
      setCopied(true);
    } catch {
      setCopied(false);
    }
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
            <Button variant="danger" onClick={handleDelete} isLoading={isPending}>
              Projeyi kalici sil
            </Button>
          </>
        }
      >
        <div className="field">
          <span>Silme onayi icin bu slug bilgisini kullan</span>
          <div className="inline-card stack-top-sm">
            <div>
              <strong>Slug</strong>
              <p
                style={{
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
                  fontSize: "0.95rem",
                  wordBreak: "break-all",
                }}
              >
                {slug}
              </p>
            </div>
            <div className="actions compact-actions">
              <Button type="button" variant="ghost" onClick={() => setConfirmationValue(slug)} disabled={isPending}>
                Slug'i doldur
              </Button>
              <Button type="button" variant="ghost" onClick={handleCopySlug} disabled={isPending}>
                {copied ? "Kopyalandi" : "Kopyala"}
              </Button>
            </div>
          </div>
          <span className="stack-top-sm">Onay icin yukaridaki slug bilgisini aynen gir</span>
          <input
            value={confirmationValue}
            onChange={(event) => setConfirmationValue(event.target.value)}
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
