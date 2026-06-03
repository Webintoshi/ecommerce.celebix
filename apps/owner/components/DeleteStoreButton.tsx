"use client";

import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

interface DeleteStoreButtonProps {
  slug: string;
  name: string;
  disabled?: boolean;
  disabledReason?: string;
}

interface CleanupTargetResult {
  type: string;
  identifier: string;
  status: "deleted" | "missing" | "failed" | "skipped";
  message?: string | null;
}

export function DeleteStoreButton({
  slug,
  name,
  disabled = false,
  disabledReason,
}: DeleteStoreButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [confirmationValue, setConfirmationValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [details, setDetails] = useState<CleanupTargetResult[]>([]);
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();

  const isConfirmed = useMemo(
    () => {
      const normalizedValue = confirmationValue.trim().toLocaleLowerCase("tr");
      return normalizedValue === slug.toLocaleLowerCase("tr") || normalizedValue === name.trim().toLocaleLowerCase("tr");
    },
    [confirmationValue, slug, name],
  );

  function resetState() {
    setConfirmationValue("");
    setError(null);
    setNotice(null);
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
    if (disabled) {
      setError(disabledReason || "Preview ortaminda yazma/kurulum islemleri kapalidir.");
      return;
    }

    if (!isConfirmed) {
      setError("Devam etmek icin asagidaki slug ya da proje adini aynen gir veya tek tikla doldur.");
      return;
    }

    setError(null);
    setNotice(null);
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
          authorityDeleted?: boolean;
          orphanedTargets?: CleanupTargetResult[];
          result?: { targets?: CleanupTargetResult[] };
        };

        if (!response.ok) {
          setError(payload.error || "Proje silme islemi basarisiz oldu.");
          setDetails(payload.result?.targets ?? []);
          return;
        }

        const orphanedTargets = payload.orphanedTargets ?? [];
        const targetDetails = payload.result?.targets ?? orphanedTargets;

        if (orphanedTargets.length > 0) {
          setNotice("Owner authority silindi. Orphan kalan hedefler asagida listelendi.");
          setDetails(targetDetails);
          window.setTimeout(() => {
            window.location.assign("/stores");
          }, 1800);
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
      <Button variant="danger" onClick={() => setIsOpen(true)} disabled={disabled}>
        Projeyi sil
      </Button>
      {disabledReason ? <p className="form-notice stack-top-sm">{disabledReason}</p> : null}

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
          <span>Silme onayi icin slug ya da proje adini kullan</span>
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
              <strong>Proje Adi</strong>
              <p
                style={{
                  fontSize: "0.95rem",
                  wordBreak: "break-word",
                }}
              >
                {name}
              </p>
            </div>
            <div className="actions compact-actions">
              <Button type="button" variant="ghost" onClick={() => setConfirmationValue(slug)} disabled={isPending}>
                Slug'i doldur
              </Button>
              <Button type="button" variant="ghost" onClick={() => setConfirmationValue(name)} disabled={isPending}>
                Proje adini doldur
              </Button>
              <Button type="button" variant="ghost" onClick={handleCopySlug} disabled={isPending}>
                {copied ? "Kopyalandi" : "Kopyala"}
              </Button>
            </div>
          </div>
          <span className="stack-top-sm">Onay icin yukaridaki slug ya da proje adini aynen gir</span>
          <input
            value={confirmationValue}
            onChange={(event) => setConfirmationValue(event.target.value)}
            placeholder={`${slug} veya ${name}`}
            autoComplete="off"
          />
          <small>
            Bu proje silinirse owner kaydi, bagli deploymentlar ve altyapi kaynaklari kaldirilir.
          </small>
        </div>

        {error ? <p className="form-error stack-top-sm">{error}</p> : null}
        {notice ? <p className="form-notice stack-top-sm">{notice}</p> : null}

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
