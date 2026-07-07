"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  SELF_SERVE_REQUEST_STORAGE_KEY,
  getSelfServeStatusLabel,
  type SelfServeOnboardingRequest,
} from "@/lib/self-serve-onboarding";
import type { SelfServeFeatureFlags } from "@/lib/self-serve-flags";

interface SelfServeOwnerRequestsPanelProps {
  initialRequests: SelfServeOnboardingRequest[];
  flags: SelfServeFeatureFlags;
  persistenceMode: string;
}

function readBrowserRequests(): SelfServeOnboardingRequest[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(SELF_SERVE_REQUEST_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SelfServeOnboardingRequest[]) : [];
  } catch {
    return [];
  }
}

function mergeRequests(
  serverRequests: SelfServeOnboardingRequest[],
  browserRequests: SelfServeOnboardingRequest[],
) {
  const byId = new Map<string, SelfServeOnboardingRequest>();

  for (const request of [...browserRequests, ...serverRequests]) {
    byId.set(request.id, request);
  }

  return [...byId.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function SelfServeOwnerRequestsPanel({ initialRequests, flags, persistenceMode }: SelfServeOwnerRequestsPanelProps) {
  const [browserRequests, setBrowserRequests] = useState<SelfServeOnboardingRequest[]>([]);

  useEffect(() => {
    setBrowserRequests(readBrowserRequests());
  }, []);

  const requests = useMemo(
    () => mergeRequests(initialRequests, browserRequests),
    [browserRequests, initialRequests],
  );

  return (
    <div className="card">
      <div className="section-head">
        <div>
          <div className="card-title">Self-serve basvurular</div>
          <p className="section-copy">
            Persistence: {persistenceMode}. Store create ve provisioning bayraklari kapali oldugu surece onay butonlari yalnizca UI sinyalidir.
          </p>
        </div>
        <div className="actions">
          <span className={`pill ${flags.provisioningEnabled ? "pill-accent" : ""}`}>
            Provisioning {flags.provisioningEnabled ? "acik" : "kapali"}
          </span>
          <span className={`pill ${flags.storeCreateEnabled ? "pill-accent" : ""}`}>
            Store create {flags.storeCreateEnabled ? "acik" : "kapali"}
          </span>
        </div>
      </div>

      {requests.length === 0 ? (
        <div className="empty-state empty-state-compact">
          <h3>Henüz self-serve başvuru yok</h3>
          <p>İlk başvuru geldiğinde applicant, mağaza ve ihtiyaç bilgileri burada listelenecek.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Applicant</th>
                <th>Magaza</th>
                <th>Ihtiyaclar</th>
                <th>Durum</th>
                <th>Tarih</th>
                <th className="table-cell-right">Aksiyon</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((request) => (
                <tr key={request.id}>
                  <td>
                    <strong>{request.applicant.fullName}</strong>
                    <div className="table-inline-meta">{request.applicant.email}</div>
                    <div className="table-inline-meta">{request.applicant.phone}</div>
                  </td>
                  <td>
                    <strong>{request.store.storeName}</strong>
                    <div className="table-inline-meta">{request.store.slug} · {request.store.sector}</div>
                    <div className="table-inline-meta">{request.business.businessName}</div>
                  </td>
                  <td>
                    <div className="inline-stack">
                      {request.needs.wantsDomain ? <span className="pill">Domain</span> : null}
                      {request.needs.wantsCorporateEmail ? <span className="pill">Mail</span> : null}
                      {request.needs.wantsProductMigration ? <span className="pill">Urun tasima</span> : null}
                    </div>
                  </td>
                  <td><span className="pill pill-accent">{getSelfServeStatusLabel(request.status)}</span></td>
                  <td>{new Date(request.createdAt).toLocaleString("tr-TR")}</td>
                  <td className="table-cell-right">
                    <div className="actions actions-end">
                      <Link className="button button-secondary" href={`/owner/self-serve/${request.id}`}>Detay</Link>
                      <button className="button button-ghost" type="button" disabled title="Phase 1: safe UI only">
                        Onay
                      </button>
                      <button className="button button-ghost" type="button" disabled title="Phase 1: safe UI only">
                        Red
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
