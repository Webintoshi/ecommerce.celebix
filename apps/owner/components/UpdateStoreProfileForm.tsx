"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState, useTransition } from "react";

type OwnerStoreStatus = "draft" | "active" | "paused";
type StoreLifecycleStage = "onboarding" | "building" | "launch_ready" | "live" | "growth";
type StorePriority = "normal" | "high" | "critical";
type BillingStatus = "healthy" | "follow_up" | "hold";

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
    };
  };
}

export function UpdateStoreProfileForm({ store }: UpdateStoreProfileFormProps) {
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
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);

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
          billingStatus
        })
      });

      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(payload.error || "Proje profili kaydedilemedi.");
        return;
      }

      setNotice("Proje profili guncellendi.");
      router.refresh();
    });
  }

  return (
    <form className="form-grid form-grid-2" onSubmit={handleSubmit}>
      <label className="field">
        <span>Proje durumu</span>
        <select value={status} onChange={(event) => setStatus(event.target.value as OwnerStoreStatus)}>
          <option value="draft">Taslak</option>
          <option value="active">Aktif</option>
          <option value="paused">Duraklatildi</option>
        </select>
      </label>

      <label className="field">
        <span>Yasam dongusu</span>
        <select value={lifecycleStage} onChange={(event) => setLifecycleStage(event.target.value as StoreLifecycleStage)}>
          <option value="onboarding">Onboarding</option>
          <option value="building">Kurulumda</option>
          <option value="launch_ready">Yayina hazir</option>
          <option value="live">Canlida</option>
          <option value="growth">Buyume asamasinda</option>
        </select>
      </label>

      <label className="field">
        <span>Client / marka adi</span>
        <input value={clientCompanyName} onChange={(event) => setClientCompanyName(event.target.value)} placeholder="Deri Kordon" />
      </label>

      <label className="field">
        <span>Oncelik</span>
        <select value={priority} onChange={(event) => setPriority(event.target.value as StorePriority)}>
          <option value="normal">Normal</option>
          <option value="high">Yuksek</option>
          <option value="critical">Kritik</option>
        </select>
      </label>

      <label className="field field-full">
        <span>Tagline</span>
        <input value={tagline} onChange={(event) => setTagline(event.target.value)} placeholder="Marka konumlamasi" />
      </label>

      <label className="field">
        <span>Client yetkilisi</span>
        <input value={clientContactName} onChange={(event) => setClientContactName(event.target.value)} placeholder="Marka sahibi" />
      </label>

      <label className="field">
        <span>Ic sorumlu</span>
        <input value={internalOwner} onChange={(event) => setInternalOwner(event.target.value)} placeholder="Webintoshi" />
      </label>

      <label className="field">
        <span>Client e-posta</span>
        <input type="email" value={clientContactEmail} onChange={(event) => setClientContactEmail(event.target.value)} placeholder="iletisim@marka.com" />
      </label>

      <label className="field">
        <span>Client telefon</span>
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
          <option value="healthy">Saglikli</option>
          <option value="follow_up">Takipte</option>
          <option value="hold">Beklemede</option>
        </select>
      </label>

      <label className="field">
        <span>Hedef yayin tarihi</span>
        <input type="date" value={launchTarget} onChange={(event) => setLaunchTarget(event.target.value)} />
      </label>

      <label className="field field-full">
        <span>Siradaki owner aksiyonu</span>
        <textarea
          value={nextAction}
          onChange={(event) => setNextAction(event.target.value)}
          placeholder="Orn: Panel login teslimi ve ilk urun importu bekleniyor."
          rows={3}
        />
      </label>

      <label className="field field-full">
        <span>Ic notlar</span>
        <textarea
          value={ownerNotes}
          onChange={(event) => setOwnerNotes(event.target.value)}
          placeholder="Bu magazayla ilgili notlar, riskler ve takip maddeleri."
          rows={4}
        />
      </label>

      {error ? <p className="form-error field-full">{error}</p> : null}
      {notice ? <p className="form-notice field-full">{notice}</p> : null}

      <div className="actions field-full">
        <button type="submit" className="button button-primary" disabled={isPending}>
          {isPending ? "Kaydediliyor..." : "Proje profilini guncelle"}
        </button>
      </div>
    </form>
  );
}
