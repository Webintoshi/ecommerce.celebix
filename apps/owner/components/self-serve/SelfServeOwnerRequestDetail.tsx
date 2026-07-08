"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  SELF_SERVE_REQUEST_STORAGE_KEY,
  getSelfServeStatusLabel,
  type SelfServeOnboardingRequest,
} from "@/lib/self-serve-onboarding";
import type { SelfServeFeatureFlags } from "@/lib/self-serve-flags";

interface SelfServeOwnerRequestDetailProps {
  requestId: string;
  initialRequest: SelfServeOnboardingRequest | null;
  flags: SelfServeFeatureFlags;
}

type MonitorRequest = SelfServeOnboardingRequest & {
  registration?: {
    plan?: string;
    defaultDomainMode?: string;
    customDomainAtRegistration?: boolean;
    autoProvisioningEnabled?: boolean;
  };
};

function readBrowserRequest(requestId: string): SelfServeOnboardingRequest | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(SELF_SERVE_REQUEST_STORAGE_KEY);
    const requests = raw ? (JSON.parse(raw) as SelfServeOnboardingRequest[]) : [];
    return requests.find((request) => request.id === requestId) ?? null;
  } catch {
    return null;
  }
}

export function SelfServeOwnerRequestDetail({ requestId, initialRequest, flags }: SelfServeOwnerRequestDetailProps) {
  const [request, setRequest] = useState<SelfServeOnboardingRequest | null>(initialRequest);

  useEffect(() => {
    setRequest((current) => current ?? readBrowserRequest(requestId));
  }, [requestId]);

  if (!request) {
    return (
      <div className="card">
        <div className="empty-state empty-state-compact">
          <h3>Kayıt bulunamadı</h3>
          <p>Volatile adapter restart edilmiş olabilir veya bu kayıt farklı bir tarayıcıda oluşturulmuş olabilir.</p>
          <Link className="button button-secondary" href="/owner/self-serve">Listeye dön</Link>
        </div>
      </div>
    );
  }

  const monitorRequest = request as MonitorRequest;
  const planLabel = monitorRequest.registration?.plan === "free" || !monitorRequest.registration?.plan
    ? "Free starter"
    : monitorRequest.registration.plan;
  const domainModeLabel = monitorRequest.registration?.defaultDomainMode === "subdomain" || request.store.proposedDomain
    ? "Celebix subdomain"
    : "Panelden sonra eklenecek";
  const plannedStoreUrl =
    request.store.plannedStoreUrl ?? (request.store.proposedDomain ? `https://${request.store.proposedDomain}` : request.store.slug);
  const plannedAdminUrl = request.store.plannedAdminUrl ?? `https://admin-${request.store.slug}.${flags.defaultDomainSuffix}`;

  return (
    <div className="self-serve-detail-grid">
      <section className="card">
        <div className="section-head">
          <div>
            <div className="card-title">{request.store.storeName}</div>
            <p className="section-copy">{request.store.slug} · {request.store.sector}</p>
          </div>
          <span className="pill pill-accent">{getSelfServeStatusLabel(request.status)}</span>
        </div>
        <div className="meta-pairs">
          <span>Müşteri: <strong>{request.applicant.fullName}</strong></span>
          <span>E-posta: <strong>{request.applicant.email}</strong></span>
          <span>Telefon: <strong>{request.applicant.phone}</strong></span>
          <span>İşletme: <strong>{request.business.businessName}</strong> ({request.business.businessType})</span>
          <span>Oluşturma: <strong>{new Date(request.createdAt).toLocaleString("tr-TR")}</strong></span>
        </div>
      </section>

      <section className="card">
        <div className="card-title">Paket ve domain</div>
        <div className="meta-pairs">
          <span>Paket: <strong>{planLabel}</strong></span>
          <span>Domain modu: <strong>{domainModeLabel}</strong></span>
          <span>Mağaza URL: <strong>{plannedStoreUrl}</strong></span>
          <span>Admin URL: <strong>{plannedAdminUrl}</strong></span>
          <span>Özel domain: <strong>Mağaza paneli → Ayarlar → Domainler</strong></span>
          <span>Ürün limiti modeli: <strong>Paket yükseltme sonrası genişler</strong></span>
        </div>
      </section>

      <section className="card">
        <div className="card-title">Provisioning monitörü</div>
        <div className="meta-pairs">
          <span>Otomatik pipeline: <strong>{flags.autoProvisioningEnabled ? "Acik" : "Guvenli bekleme"}</strong></span>
          <span>Store create: <strong>{flags.storeCreateEnabled ? "Acik" : "Kapali"}</strong></span>
          <span>Provisioning: <strong>{flags.provisioningEnabled ? "Acik" : "Kapali"}</strong></span>
          <span>Runtime cutover: <strong>Yok</strong></span>
        </div>
        <div className="actions stack-top-md">
          <Link className="button button-ghost" href="/owner/self-serve">Listeye dön</Link>
        </div>
      </section>
    </div>
  );
}
