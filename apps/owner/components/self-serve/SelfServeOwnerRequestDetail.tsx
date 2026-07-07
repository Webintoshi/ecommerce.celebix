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
          <h3>Basvuru bulunamadi</h3>
          <p>Volatile adapter restart edilmis olabilir veya bu basvuru farkli bir tarayicida olusturulmus olabilir.</p>
          <Link className="button button-secondary" href="/owner/self-serve">Listeye don</Link>
        </div>
      </div>
    );
  }

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
          <span>Basvuran: <strong>{request.applicant.fullName}</strong></span>
          <span>E-posta: <strong>{request.applicant.email}</strong></span>
          <span>Telefon: <strong>{request.applicant.phone}</strong></span>
          <span>Isletme: <strong>{request.business.businessName}</strong> ({request.business.businessType})</span>
          <span>Olusturma: <strong>{new Date(request.createdAt).toLocaleString("tr-TR")}</strong></span>
        </div>
      </section>

      <section className="card">
        <div className="card-title">Ihtiyac ozeti</div>
        <div className="meta-pairs">
          <span>Domaini var mi? <strong>{request.needs.hasDomain ? "Evet" : "Hayir"}</strong></span>
          <span>Domain ister mi? <strong>{request.needs.wantsDomain ? "Evet" : "Hayir"}</strong></span>
          <span>Kurumsal mail? <strong>{request.needs.wantsCorporateEmail ? "Evet" : "Hayir"}</strong></span>
          <span>Urun tasima? <strong>{request.needs.wantsProductMigration ? "Evet" : "Hayir"}</strong></span>
          <span>Urun sayisi: <strong>{request.needs.approximateProductCount}</strong></span>
          <span>Tasarim: <strong>{request.needs.designPreference}</strong></span>
        </div>
      </section>

      <section className="card">
        <div className="card-title">Phase 1 guvenlik durumu</div>
        <div className="meta-pairs">
          <span>Owner approval: <strong>{request.ownerApprovalRequired ? "Gerekli" : "Kapali"}</strong></span>
          <span>Store create: <strong>{flags.storeCreateEnabled ? "Acik" : "Kapali"}</strong></span>
          <span>Provisioning: <strong>{flags.provisioningEnabled ? "Acik" : "Kapali"}</strong></span>
          <span>Runtime cutover: <strong>Yok</strong></span>
        </div>
        <div className="actions stack-top-md">
          <button className="button button-primary" type="button" disabled title="Phase 1: no real approval mutation">
            Onayla (UI only)
          </button>
          <button className="button button-secondary" type="button" disabled title="Phase 1: no real rejection mutation">
            Reddet (UI only)
          </button>
          <Link className="button button-ghost" href="/owner/self-serve">Listeye don</Link>
        </div>
      </section>
    </div>
  );
}
