"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState, useTransition } from "react";

type OwnerStoreStatus = "draft" | "active" | "paused";
type StoreLifecycleStage = "onboarding" | "building" | "launch_ready" | "live" | "growth";
type StorePriority = "normal" | "high" | "critical";
type BillingStatus = "healthy" | "follow_up" | "hold";
type StoreSubscriptionStatus = "unconfigured" | "active" | "expiring" | "expired";

interface UpdateStoreProfileFormProps {
  store: {
    slug: string;
    status: OwnerStoreStatus;
    tagline: string | null;
    supportEmail: string | null;
    supportPhone: string | null;
    management: {
      clientCompanyName: string | null;
      clientContactName: string | null;
      clientContactEmail: string | null;
      clientContactPhone: string | null;
      internalOwner: string | null;
      lifecycleStage: StoreLifecycleStage;
      priority: StorePriority;
      nextAction: string | null;
      launchTarget: string | null;
      ownerNotes: string | null;
      billingStatus: BillingStatus;
      subscription: {
        startDate: string | null;
        durationMonths: number | null;
        countdownLabel: string;
        status: StoreSubscriptionStatus;
      };
    };
  };
  disabled?: boolean;
  disabledReason?: string;
}

export function UpdateStoreProfileForm({
  store,
  disabled = false,
  disabledReason,
}: UpdateStoreProfileFormProps) {
  const router = useRouter();
  const [status, setStatus] = useState<OwnerStoreStatus>(store.status);
  const [tagline, setTagline] = useState(store.tagline ?? "");
  const [supportEmail, setSupportEmail] = useState(store.supportEmail ?? "");
  const [supportPhone, setSupportPhone] = useState(store.supportPhone ?? "");
  const [clientCompanyName, setClientCompanyName] = useState(store.management.clientCompanyName ?? "");
  const [clientContactName, setClientContactName] = useState(store.management.clientContactName ?? "");
  const [clientContactEmail, setClientContactEmail] = useState(store.management.clientContactEmail ?? "");
  const [clientContactPhone, setClientContactPhone] = useState(store.management.clientContactPhone ?? "");
  const [internalOwner, setInternalOwner] = useState(store.management.internalOwner ?? "");
  const [lifecycleStage, setLifecycleStage] = useState<StoreLifecycleStage>(store.management.lifecycleStage);
  const [priority, setPriority] = useState<StorePriority>(store.management.priority);
  const [nextAction, setNextAction] = useState(store.management.nextAction ?? "");
  const [launchTarget, setLaunchTarget] = useState(store.management.launchTarget ?? "");
  const [ownerNotes, setOwnerNotes] = useState(store.management.ownerNotes ?? "");
  const [billingStatus, setBillingStatus] = useState<BillingStatus>(store.management.billingStatus);
  const [packageStartDate, setPackageStartDate] = useState(store.management.subscription.startDate ?? "");
  const [packageDurationMonths, setPackageDurationMonths] = useState(
    store.management.subscription.durationMonths?.toString() ?? ""
  );
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);

    if (disabled) {
      setError(disabledReason || "Önizleme ortamında yazma ve kurulum işlemleri kapalıdır.");
      return;
    }

    startTransition(async () => {
      const response = await fetch(`/api/stores/${store.slug}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          status,
          tagline,
          supportEmail,
          supportPhone,
          clientCompanyName,
          clientContactName,
          clientContactEmail,
          clientContactPhone,
          internalOwner,
          lifecycleStage,
          priority,
          nextAction,
          launchTarget,
          ownerNotes,
          billingStatus,
          packageStartDate,
          packageDurationMonths:
            packageDurationMonths.trim().length > 0 ? Number(packageDurationMonths) : null
        })
      });

      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(payload.error || "Mağaza profili kaydedilemedi.");
        return;
      }

      setNotice("Mağaza profili güncellendi.");
      router.refresh();
    });
  }

  return (
    <form className="form-grid form-grid-2" onSubmit={handleSubmit}>
      <fieldset className="preview-form-fieldset field-full" disabled={disabled}>
      <label className="field">
        <span>Mağaza durumu</span>
        <select value={status} onChange={(event) => setStatus(event.target.value as OwnerStoreStatus)}>
          <option value="draft">Taslak</option>
          <option value="active">Aktif</option>
          <option value="paused">Duraklatıldı</option>
        </select>
      </label>

      <label className="field">
        <span>Yaşam döngüsü</span>
        <select value={lifecycleStage} onChange={(event) => setLifecycleStage(event.target.value as StoreLifecycleStage)}>
          <option value="onboarding">Onboarding</option>
          <option value="building">Kurulumda</option>
          <option value="launch_ready">Yayına hazır</option>
          <option value="live">Canlıda</option>
          <option value="growth">Büyüme aşamasında</option>
        </select>
      </label>

      <label className="field">
        <span>Müşteri / marka adı</span>
        <input value={clientCompanyName} onChange={(event) => setClientCompanyName(event.target.value)} placeholder="Deri Kordon" />
      </label>

      <label className="field">
        <span>Öncelik</span>
        <select value={priority} onChange={(event) => setPriority(event.target.value as StorePriority)}>
          <option value="normal">Normal</option>
          <option value="high">Yüksek</option>
          <option value="critical">Kritik</option>
        </select>
      </label>

      <label className="field field-full">
        <span>Tagline</span>
        <input value={tagline} onChange={(event) => setTagline(event.target.value)} placeholder="Marka konumlaması" />
      </label>

      <label className="field">
        <span>Müşteri yetkilisi</span>
        <input value={clientContactName} onChange={(event) => setClientContactName(event.target.value)} placeholder="Marka sahibi" />
      </label>

      <label className="field">
        <span>İç sorumlu</span>
        <input value={internalOwner} onChange={(event) => setInternalOwner(event.target.value)} placeholder="Webintoshi" />
      </label>

      <label className="field">
        <span>Müşteri e-postası</span>
        <input type="email" value={clientContactEmail} onChange={(event) => setClientContactEmail(event.target.value)} placeholder="iletisim@marka.com" />
      </label>

      <label className="field">
        <span>Müşteri telefonu</span>
        <input value={clientContactPhone} onChange={(event) => setClientContactPhone(event.target.value)} placeholder="+90 5xx xxx xx xx" />
      </label>

      <label className="field">
        <span>Destek e-posta</span>
        <input type="email" value={supportEmail} onChange={(event) => setSupportEmail(event.target.value)} placeholder="destek@marka.com" />
      </label>

      <label className="field">
        <span>Destek telefon</span>
        <input value={supportPhone} onChange={(event) => setSupportPhone(event.target.value)} placeholder="+90 5xx xxx xx xx" />
      </label>

      <label className="field">
        <span>Tahsilat durumu</span>
        <select value={billingStatus} onChange={(event) => setBillingStatus(event.target.value as BillingStatus)}>
          <option value="healthy">Sağlıklı</option>
          <option value="follow_up">Takipte</option>
          <option value="hold">Beklemede</option>
        </select>
      </label>

      <label className="field">
        <span>Hedef yayın tarihi</span>
        <input type="date" value={launchTarget} onChange={(event) => setLaunchTarget(event.target.value)} />
      </label>

      <label className="field">
        <span>Paket başlangıç tarihi</span>
        <input
          type="date"
          value={packageStartDate}
          onChange={(event) => setPackageStartDate(event.target.value)}
        />
      </label>

      <label className="field">
        <span>Paket süresi (ay)</span>
        <input
          type="number"
          min="1"
          step="1"
          value={packageDurationMonths}
          onChange={(event) => setPackageDurationMonths(event.target.value)}
          placeholder="1"
        />
        <small>
          {store.management.subscription.countdownLabel} ({store.management.subscription.status})
        </small>
      </label>

      <label className="field field-full">
        <span>Sıradaki owner aksiyonu</span>
        <textarea
          value={nextAction}
          onChange={(event) => setNextAction(event.target.value)}
          placeholder="Örn: Panel login teslimi ve ilk ürün importu bekleniyor."
          rows={3}
        />
      </label>

      <label className="field field-full">
        <span>İç notlar</span>
        <textarea
          value={ownerNotes}
          onChange={(event) => setOwnerNotes(event.target.value)}
          placeholder="Bu mağazayla ilgili notlar, riskler ve takip maddeleri."
          rows={4}
        />
      </label>
      </fieldset>

      {error ? <p className="form-error field-full">{error}</p> : null}
      {notice ? <p className="form-notice field-full">{notice}</p> : null}
      {disabledReason ? <p className="form-notice form-notice-preview field-full">{disabledReason}</p> : null}

      <div className="actions field-full">
        <button
          type="submit"
          className={`button button-primary${disabledReason ? " button-preview-disabled" : ""}`}
          disabled={disabled || isPending}
        >
          {isPending ? "Kaydediliyor..." : "Mağaza profilini güncelle"}
        </button>
      </div>
    </form>
  );
}
