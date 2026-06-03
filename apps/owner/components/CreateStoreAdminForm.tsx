"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState, useTransition } from "react";

type StoreAdminRole = "super_admin" | "product_manager" | "content_creator" | "order_manager";

const ROLE_OPTIONS: Array<{ value: StoreAdminRole; label: string }> = [
  { value: "super_admin", label: "Super admin" },
  { value: "product_manager", label: "Urun yoneticisi" },
  { value: "content_creator", label: "Icerik editoru" },
  { value: "order_manager", label: "Siparis yoneticisi" },
];

interface CreateStoreAdminFormProps {
  storeSlug: string;
  disabled?: boolean;
  disabledReason?: string;
}

export function CreateStoreAdminForm({
  storeSlug,
  disabled = false,
  disabledReason,
}: CreateStoreAdminFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<StoreAdminRole>("product_manager");
  const [taskDefinition, setTaskDefinition] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);

    if (disabled) {
      setError(disabledReason || "Preview ortaminda yazma/kurulum islemleri kapalidir.");
      return;
    }

    startTransition(async () => {
      const response = await fetch(`/api/stores/${storeSlug}/admins`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email,
          fullName,
          password,
          role,
          taskDefinition
        })
      });

      const payload = (await response.json()) as { error?: string; success?: boolean; created?: boolean };

      if (!response.ok) {
        setError(payload.error || "Store admin kaydedilemedi.");
        return;
      }

      setNotice(payload.created ? "Store admin hesabi olusturuldu." : "Store admin hesabi guncellendi.");
      setEmail("");
      setFullName("");
      setPassword("");
      setRole("product_manager");
      setTaskDefinition("");
      router.refresh();
    });
  }

  return (
    <form className="form-grid form-grid-2" onSubmit={handleSubmit}>
      <fieldset className="preview-form-fieldset field-full" disabled={disabled}>
      <label className="field">
        <span>Ad soyad</span>
        <input value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Magaza yoneticisi" required />
      </label>

      <label className="field">
        <span>E-posta</span>
        <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="yonetici@marka.com" required />
      </label>

      <label className="field">
        <span>Gecici sifre</span>
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="En az 8 karakter"
          minLength={8}
          required
        />
      </label>

      <label className="field">
        <span>Rol</span>
        <select value={role} onChange={(event) => setRole(event.target.value as StoreAdminRole)} required>
          {ROLE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <label className="field field-full">
        <span>Gorev tanimi</span>
        <textarea
          value={taskDefinition}
          onChange={(event) => setTaskDefinition(event.target.value)}
          placeholder="Orn: Siparis akisini ve destek taleplerini yonetecek."
          rows={4}
        />
      </label>
      </fieldset>

      {error ? <p className="form-error field-full">{error}</p> : null}
      {notice ? <p className="form-notice field-full">{notice}</p> : null}
      {disabledReason ? <p className="form-notice field-full">{disabledReason}</p> : null}

      <div className="actions field-full">
        <button type="submit" className="button button-primary" disabled={disabled || isPending}>
          {isPending ? "Kaydediliyor..." : "Store admin kaydet"}
        </button>
      </div>
    </form>
  );
}
