"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState, useTransition } from "react";

interface StoreOption {
  slug: string;
  name: string;
}

interface CreateAffiliateFormProps {
  stores: StoreOption[];
  defaultStoreSlug?: string;
  disabled?: boolean;
  disabledReason?: string;
}

export function CreateAffiliateForm({
  stores,
  defaultStoreSlug,
  disabled = false,
  disabledReason,
}: CreateAffiliateFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [storeSlug, setStoreSlug] = useState(defaultStoreSlug ?? stores[0]?.slug ?? "");
  const [commissionRate, setCommissionRate] = useState("10");
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
      const response = await fetch("/api/affiliates", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email,
          fullName,
          password,
          storeSlug,
          commissionRate: Number(commissionRate)
        })
      });

      const payload = (await response.json()) as { error?: string; success?: boolean };

      if (!response.ok) {
        setError(payload.error || "Affiliate oluşturulamadı.");
        return;
      }

      setNotice("Affiliate hesabı ve mağaza yetkisi kaydedildi.");
      setEmail("");
      setFullName("");
      setPassword("");
      router.refresh();
    });
  }

  return (
    <form className="form-grid form-grid-2" onSubmit={handleSubmit}>
      <fieldset className="preview-form-fieldset field-full" disabled={disabled}>
      <label className="field">
        <span>Ad soyad</span>
        <input value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Partner kullanıcı" />
      </label>

      <label className="field">
        <span>E-posta</span>
        <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="partner@ornek.com" required />
      </label>

      <label className="field">
        <span>Geçici şifre</span>
        <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="En az 8 karakter" minLength={8} required />
      </label>

      <label className="field">
        <span>Mağaza</span>
        <select value={storeSlug} onChange={(event) => setStoreSlug(event.target.value)} required>
          {stores.map((store) => (
            <option key={store.slug} value={store.slug}>
              {store.name}
            </option>
          ))}
        </select>
      </label>

      <label className="field field-full">
        <span>Komisyon oranı (%)</span>
        <input
          type="number"
          min="0"
          max="100"
          step="0.01"
          value={commissionRate}
          onChange={(event) => setCommissionRate(event.target.value)}
          required
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
          disabled={disabled || isPending || stores.length === 0}
        >
          {isPending ? "Kaydediliyor..." : "Affiliate kaydet"}
        </button>
      </div>
    </form>
  );
}
