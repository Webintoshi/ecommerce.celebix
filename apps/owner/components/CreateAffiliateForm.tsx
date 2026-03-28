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
}

export function CreateAffiliateForm({ stores, defaultStoreSlug }: CreateAffiliateFormProps) {
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
        setError(payload.error || "Affiliate olusturulamadi.");
        return;
      }

      setNotice("Affiliate hesabi ve store yetkisi kaydedildi.");
      setEmail("");
      setFullName("");
      setPassword("");
      router.refresh();
    });
  }

  return (
    <form className="form-grid form-grid-2" onSubmit={handleSubmit}>
      <label className="field">
        <span>Ad soyad</span>
        <input value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Partner kullanici" />
      </label>

      <label className="field">
        <span>E-posta</span>
        <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="partner@ornek.com" required />
      </label>

      <label className="field">
        <span>Gecici sifre</span>
        <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="En az 8 karakter" minLength={8} required />
      </label>

      <label className="field">
        <span>Proje</span>
        <select value={storeSlug} onChange={(event) => setStoreSlug(event.target.value)} required>
          {stores.map((store) => (
            <option key={store.slug} value={store.slug}>
              {store.name}
            </option>
          ))}
        </select>
      </label>

      <label className="field field-full">
        <span>Komisyon orani (%)</span>
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

      {error ? <p className="form-error field-full">{error}</p> : null}
      {notice ? <p className="form-notice field-full">{notice}</p> : null}

      <div className="actions field-full">
        <button type="submit" className="button button-primary" disabled={isPending || stores.length === 0}>
          {isPending ? "Kaydediliyor..." : "Affiliate kaydet"}
        </button>
      </div>
    </form>
  );
}
