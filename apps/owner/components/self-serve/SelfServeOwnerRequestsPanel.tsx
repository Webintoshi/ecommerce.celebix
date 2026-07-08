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

type MonitorRequest = SelfServeOnboardingRequest & {
  registration?: {
    plan?: string;
    defaultDomainMode?: string;
    customDomainAtRegistration?: boolean;
  };
};

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

function getPlanLabel(request: MonitorRequest) {
  return request.registration?.plan === "free" || !request.registration?.plan ? "Free starter" : request.registration.plan;
}

function getDomainLabel(request: MonitorRequest) {
  return request.registration?.defaultDomainMode === "subdomain" || request.store.proposedDomain
    ? "Celebix subdomain"
    : "Domain sonra";
}

function getStoreUrl(request: SelfServeOnboardingRequest) {
  return request.store.plannedStoreUrl ?? (request.store.proposedDomain ? `https://${request.store.proposedDomain}` : request.store.slug);
}

function getProvisioningLabel(request: SelfServeOnboardingRequest, flags: SelfServeFeatureFlags) {
  if (flags.autoProvisioningEnabled && flags.storeCreateEnabled && flags.provisioningEnabled) {
    return request.status === "ready" ? "Hazır" : "Otomasyon izleniyor";
  }

  return "Güvenli bekleme";
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
          <div className="card-title">Otomatik mağaza kayıtları</div>
          <p className="section-copy">
            Persistence: {persistenceMode}. Super admin normal kayıtlar için kapı görevi yapmaz; mağaza, paket,
            hata ve risk sinyallerini izler.
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
          <h3>Henüz otomatik mağaza kaydı yok</h3>
          <p>İlk kayıt geldiğinde müşteri, mağaza, paket ve provisioning durumu burada görünür.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Müşteri</th>
                <th>Mağaza</th>
                <th>Paket</th>
                <th>Provisioning</th>
                <th>Durum</th>
                <th>Tarih</th>
                <th className="table-cell-right">İzleme</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((request) => {
                const monitorRequest = request as MonitorRequest;

                return (
                <tr key={request.id}>
                  <td>
                    <strong>{request.applicant.fullName}</strong>
                    <div className="table-inline-meta">{request.applicant.email}</div>
                    <div className="table-inline-meta">{request.applicant.phone}</div>
                  </td>
                  <td>
                    <strong>{request.store.storeName}</strong>
                    <div className="table-inline-meta">{request.store.slug} · {request.store.sector}</div>
                    <div className="table-inline-meta">{getStoreUrl(request)}</div>
                  </td>
                  <td>
                    <strong>{getPlanLabel(monitorRequest)}</strong>
                    <div className="table-inline-meta">{getDomainLabel(monitorRequest)}</div>
                  </td>
                  <td>
                    <span className="pill">{getProvisioningLabel(request, flags)}</span>
                    <div className="table-inline-meta">
                      Store create {flags.storeCreateEnabled ? "acik" : "kapali"} · Infra {flags.provisioningEnabled ? "acik" : "kapali"}
                    </div>
                  </td>
                  <td><span className="pill pill-accent">{getSelfServeStatusLabel(request.status)}</span></td>
                  <td>{new Date(request.createdAt).toLocaleString("tr-TR")}</td>
                  <td className="table-cell-right">
                    <div className="actions actions-end">
                      <Link className="button button-secondary" href={`/owner/self-serve/${request.id}`}>İzle</Link>
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
