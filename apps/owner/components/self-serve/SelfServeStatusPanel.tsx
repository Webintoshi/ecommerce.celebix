"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  SELF_SERVE_LAST_REQUEST_STORAGE_KEY,
  SELF_SERVE_REQUEST_STORAGE_KEY,
  getSelfServeStatusLabel,
  type SelfServeOnboardingRequest,
} from "@/lib/self-serve-onboarding";

interface SelfServeStatusPanelProps {
  requestId?: string;
}

function readRequestFromBrowser(requestId?: string): SelfServeOnboardingRequest | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const listRaw = window.localStorage.getItem(SELF_SERVE_REQUEST_STORAGE_KEY);
    const list = listRaw ? (JSON.parse(listRaw) as SelfServeOnboardingRequest[]) : [];
    const exact = requestId ? list.find((request) => request.id === requestId) : null;

    if (exact) {
      return exact;
    }

    const lastRaw = window.localStorage.getItem(SELF_SERVE_LAST_REQUEST_STORAGE_KEY);
    return lastRaw ? (JSON.parse(lastRaw) as SelfServeOnboardingRequest) : null;
  } catch {
    return null;
  }
}

export function SelfServeStatusPanel({ requestId }: SelfServeStatusPanelProps) {
  const [request, setRequest] = useState<SelfServeOnboardingRequest | null>(null);

  useEffect(() => {
    setRequest(readRequestFromBrowser(requestId));
  }, [requestId]);

  return (
    <section className="self-serve-status-card">
      <span className="pill pill-accent">Basvuru alindi</span>
      <h1>{request ? getSelfServeStatusLabel(request.status) : "Durum hazir"}</h1>
      <p>
        Basvurunuz owner ekibinin onayina dusuruldu. Bu fazda otomatik store create, DNS, Coolify,
        R2, Logto client veya DB provisioning calismaz.
      </p>

      {request ? (
        <div className="self-serve-status-grid">
          <div>
            <span>Basvuru no</span>
            <strong>{request.id}</strong>
          </div>
          <div>
            <span>Magaza</span>
            <strong>{request.store.storeName}</strong>
          </div>
          <div>
            <span>Slug</span>
            <strong>{request.store.slug}</strong>
          </div>
          <div>
            <span>Olusturma</span>
            <strong>{new Date(request.createdAt).toLocaleString("tr-TR")}</strong>
          </div>
        </div>
      ) : (
        <div className="self-serve-notice">
          <strong>Bu tarayicida basvuru kaydi bulunamadi.</strong>
          <span>Yeni bir kontrollu self-serve basvuru olusturabilir veya owner panelinden listeyi kontrol edebilirsiniz.</span>
        </div>
      )}

      <div className="self-serve-actions">
        <Link className="button button-secondary" href="/kayit">Kayit ekranina don</Link>
        <Link className="button button-primary" href="/kayit">Yeni basvuru</Link>
      </div>
    </section>
  );
}
