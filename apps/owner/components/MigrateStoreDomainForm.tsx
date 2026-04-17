"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useMemo, useState, useTransition } from "react";
import { normalizeActionError, readActionResponse } from "@/components/action-request";

interface DomainMigrationPayload {
  error?: string;
  success?: boolean;
  storefrontDomain?: string;
  adminDomain?: string;
  authoritySyncMessage?: string;
  previousStorefrontDomain?: string;
  previousAdminDomain?: string;
  adminDeployment?: {
    status: string;
    runtimeUrl: string;
    message: string | null;
  };
  storefrontDeployment?: {
    status: string;
    runtimeUrl: string;
    message: string | null;
  };
}

interface MigrateStoreDomainFormProps {
  slug: string;
  storefrontDomain: string;
  adminDomain: string;
}

function normalizeInputDomain(value: string): string {
  return value
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .toLocaleLowerCase("tr");
}

export function MigrateStoreDomainForm({
  slug,
  storefrontDomain,
  adminDomain,
}: MigrateStoreDomainFormProps) {
  const router = useRouter();
  const [domain, setDomain] = useState(storefrontDomain);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [details, setDetails] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();

  const normalizedDomain = useMemo(() => normalizeInputDomain(domain), [domain]);
  const previewAdminDomain = normalizedDomain ? `admin.${normalizedDomain}` : "";

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setDetails([]);

    startTransition(() => {
      void (async () => {
        try {
          const response = await fetch(`/api/stores/${slug}/domain-migration`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              domain: normalizedDomain,
            }),
          });
          const { payload, errorMessage } = await readActionResponse<DomainMigrationPayload>(response);

          if (!response.ok) {
            setError(errorMessage || "Domain migration basarisiz oldu.");
            return;
          }

          const nextDetails = [
            payload?.authoritySyncMessage,
            payload?.adminDeployment
              ? `Admin deploy: ${payload.adminDeployment.status} (${payload.adminDeployment.runtimeUrl})`
              : null,
            payload?.storefrontDeployment
              ? `Storefront deploy: ${payload.storefrontDeployment.status} (${payload.storefrontDeployment.runtimeUrl})`
              : null,
          ].filter((value): value is string => Boolean(value));

          setNotice(
            payload?.storefrontDomain && payload?.adminDomain
              ? `Domain migration tamamlandi: ${payload.storefrontDomain} / ${payload.adminDomain}`
              : "Domain migration tamamlandi.",
          );
          setDetails(nextDetails);
          router.refresh();
        } catch (error) {
          setError(normalizeActionError(error, "Domain migration basarisiz oldu."));
        }
      })();
    });
  }

  return (
    <form className="form-grid form-grid-2" onSubmit={handleSubmit}>
      <label className="field">
        <span>Mevcut storefront domain</span>
        <input value={storefrontDomain} disabled />
      </label>

      <label className="field">
        <span>Mevcut admin domain</span>
        <input value={adminDomain} disabled />
      </label>

      <label className="field">
        <span>Yeni storefront domain</span>
        <input
          value={domain}
          onChange={(event) => setDomain(event.target.value)}
          placeholder="wayabutik.com"
          required
        />
      </label>

      <label className="field">
        <span>Yeni admin domain</span>
        <input value={previewAdminDomain} disabled placeholder="admin.wayabutik.com" />
        <small className="muted">
          Admin domain otomatik olarak `admin.&lt;domain&gt;` formatinda uretilir.
        </small>
      </label>

      <div className="card field-full section-tight">
        <div className="card-title">Migration etkisi</div>
        <div className="meta-pairs">
          <span>Store config: <strong>guncellenecek</strong></span>
          <span>Owner authority: <strong>guncellenecek</strong></span>
          <span>Coolify admin/storefront: <strong>patch + redeploy</strong></span>
        </div>
        <p className="card-note">
          Destek ve noreply e-postalari eski domainin varsayilan formundaysa yeni domaine otomatik tasinir.
        </p>
      </div>

      {error ? <p className="form-error field-full">{error}</p> : null}
      {notice ? <p className="form-notice field-full">{notice}</p> : null}
      {details.length > 0 ? (
        <div className="stack-list field-full">
          {details.map((detail) => (
            <div key={detail} className="inline-card">
              <p>{detail}</p>
            </div>
          ))}
        </div>
      ) : null}

      <div className="actions field-full">
        <button type="submit" className="button button-primary" disabled={isPending}>
          {isPending ? "Domain tasiniyor..." : "Custom domain'e gecir"}
        </button>
      </div>
    </form>
  );
}
