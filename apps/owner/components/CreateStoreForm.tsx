"use client";

import { useRouter } from "next/navigation";
import { type ChangeEvent, type FormEvent, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormSection } from "@/components/forms/form-section";
import { useToast } from "@/hooks/use-toast";

interface FormState {
  name: string;
  slug: string;
  domain: string;
  theme: string;
  tagline: string;
  supportEmail: string;
  supportPhone: string;
}

const INITIAL_STATE: FormState = {
  name: "",
  slug: "",
  domain: "",
  theme: "atelier",
  tagline: "",
  supportEmail: "",
  supportPhone: ""
};

const THEME_OPTIONS = [
  { value: "atelier", label: "Atelier" },
  { value: "leather", label: "Leather" },
  { value: "editorial", label: "Editorial" }
];

function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("tr")
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeDomain(value: string): string {
  return value
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/+$/, "")
    .toLocaleLowerCase("tr");
}

export function CreateStoreForm() {
  const router = useRouter();
  const { success, error: showError } = useToast();
  const [form, setForm] = useState(INITIAL_STATE);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [isPending, startTransition] = useTransition();

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    if (errors[key]) {
      setErrors((prev) => ({ ...prev, [key]: undefined }));
    }
  }

  function handleNameChange(event: ChangeEvent<HTMLInputElement>) {
    const nextName = event.target.value;
    setForm((current) => ({
      ...current,
      name: nextName,
      slug: current.slug ? current.slug : slugify(nextName)
    }));
  }

  function handleSlugChange(event: ChangeEvent<HTMLInputElement>) {
    updateField("slug", slugify(event.target.value));
  }

  function handleDomainChange(event: ChangeEvent<HTMLInputElement>) {
    updateField("domain", normalizeDomain(event.target.value));
  }

  function validate(): boolean {
    const newErrors: Partial<Record<keyof FormState, string>> = {};
    
    if (!form.name.trim()) newErrors.name = "Mağaza adı zorunludur";
    if (!form.slug.trim()) newErrors.slug = "Slug zorunludur";
    if (!form.domain.trim()) newErrors.domain = "Domain zorunludur";
    if (form.supportEmail && !form.supportEmail.includes("@")) {
      newErrors.supportEmail = "Geçerli bir e-posta girin";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    
    if (!validate()) return;

    startTransition(async () => {
      const response = await fetch("/api/stores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });

      const payload = (await response.json()) as { error?: string; store?: { slug: string } };

      if (!response.ok || !payload.store) {
        showError("Hata", payload.error || "Mağaza oluşturulamadı.");
        return;
      }

      success("Başarılı", `${form.name} mağazası oluşturuldu.`);
      router.push(`/stores/${payload.store.slug}`);
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <FormSection title="Temel Bilgiler" description="Mağazanın temel kimlik bilgileri">
        <Input
          label="Mağaza Adı"
          value={form.name}
          onChange={handleNameChange}
          placeholder="Deri Kordon"
          error={errors.name}
          leftIcon={<StoreIcon />}
          required
        />
        <Input
          label="Slug"
          value={form.slug}
          onChange={handleSlugChange}
          placeholder="deri-kordon"
          error={errors.slug}
          helperText="URL'de görünecek benzersiz kimlik"
          required
        />
        <Input
          label="Storefront Domain"
          value={form.domain}
          onChange={handleDomainChange}
          placeholder="derikordon.com"
          error={errors.domain}
          helperText="Sitemap, canonical ve storefront URL'leri bu alan uzerinden uretilecektir"
          leftIcon={<GlobeIcon />}
          required
        />
        <Select
          label="Tema"
          value={form.theme}
          onChange={(e) => updateField("theme", e.target.value)}
          options={THEME_OPTIONS}
        />
      </FormSection>

      <FormSection title="Marka" description="Marka kimliği ve iletişim bilgileri">
        <Input
          label="Tagline"
          value={form.tagline}
          onChange={(e) => updateField("tagline", e.target.value)}
          placeholder="El yapımı deri kordon ve aksesuarlar"
          helperText="Marka sloganı veya açıklaması"
        />
        <Input
          label="Destek E-postası"
          type="email"
          value={form.supportEmail}
          onChange={(e) => updateField("supportEmail", e.target.value)}
          placeholder="destek@derikordon.com"
          error={errors.supportEmail}
          leftIcon={<MailIcon />}
        />
        <Input
          label="Destek Telefonu"
          value={form.supportPhone}
          onChange={(e) => updateField("supportPhone", e.target.value)}
          placeholder="+90 532 000 00 00"
          leftIcon={<PhoneIcon />}
        />
      </FormSection>

      <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#E2E8F0]">
        <Button type="button" variant="ghost" onClick={() => router.back()}>
          İptal
        </Button>
        <Button type="submit" isLoading={isPending} leftIcon={<PlusIcon />}>
          Mağaza Oluştur
        </Button>
      </div>
    </form>
  );
}

// Icons
function StoreIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  );
}
