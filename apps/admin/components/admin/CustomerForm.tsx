"use client";

import { useEffect, useState, type FormEvent, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Plus,
  Save,
  ShieldCheck,
  Tags,
  Trash2,
  User,
} from "lucide-react";
import { AdminPageHeader } from "@/components/admin/AdminPageShell";

interface AddressInput {
  title: string;
  company: string;
  firstName: string;
  lastName: string;
  phone: string;
  city: string;
  district: string;
  addressLine: string;
  addressLine2: string;
  postalCode: string;
  country: string;
}

interface CustomerFormData {
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  addresses: AddressInput[];
  status: "active" | "inactive" | "blocked";
  notes: string;
  tags: string[];
  externalCustomerId: string;
  acceptsEmailMarketing: boolean;
  acceptsSmsMarketing: boolean;
  taxExempt: boolean;
}

interface CustomerFormProps {
  customerId?: string;
  title?: string;
}

const panelClass =
  "overflow-hidden border-y border-[#E1E6EF] bg-[#F9F9F9]";

const inputClass =
  "h-10 w-full rounded-[6px] border border-[#DDE3EC] bg-white px-3 text-sm font-medium text-[#111827] outline-none transition placeholder:text-[#9CA3AF] focus:border-[#FFD7BF] focus:ring-4 focus:ring-[#FFF1E8]";

const labelClass = "mb-1.5 block text-xs font-semibold uppercase tracking-[0.08em] text-[#6B7280]";

const sectionHeaderClass = "border-b border-[#E1E6EF] px-4 py-3 md:px-6";

const sectionIconClass =
  "flex h-8 w-8 shrink-0 items-center justify-center rounded-[6px] border border-[#E1E6EF] bg-white text-[#E85D04]";

const primaryActionClass =
  "inline-flex h-10 items-center justify-center gap-2 rounded-[7px] bg-[#FF6A00] px-4 text-sm font-semibold text-white shadow-[0_10px_22px_rgba(255,106,0,0.18)] transition hover:bg-[#E85D04] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.20)] disabled:cursor-not-allowed disabled:opacity-60";

const secondaryActionClass =
  "inline-flex h-10 items-center justify-center gap-2 rounded-[7px] border border-[#DDE3EC] bg-white px-4 text-sm font-semibold text-[#374151] transition hover:border-[#FFD7BF] hover:text-[#E85D04] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.18)]";

const statusOptions: Array<{
  value: CustomerFormData["status"];
  label: string;
  tone: string;
}> = [
  {
    value: "active",
    label: "Aktif",
    tone: "border-emerald-200/80 bg-emerald-50/80 text-emerald-800",
  },
  {
    value: "inactive",
    label: "Pasif",
    tone: "border-stone-200 bg-stone-50 text-stone-700",
  },
  {
    value: "blocked",
    label: "Engellendi",
    tone: "border-rose-200/80 bg-rose-50/80 text-rose-700",
  },
];

export default function CustomerForm({ customerId, title }: CustomerFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [formData, setFormData] = useState<CustomerFormData>({
    email: "",
    firstName: "",
    lastName: "",
    phone: "",
    addresses: [],
    status: "active",
    notes: "",
    tags: [],
    externalCustomerId: "",
    acceptsEmailMarketing: false,
    acceptsSmsMarketing: false,
    taxExempt: false,
  });

  useEffect(() => {
    if (customerId) {
      void loadCustomer();
    }
  }, [customerId]);

  const loadCustomer = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/customers?id=${customerId}`);
      const data = await res.json();

      if (data.success && data.customer) {
        const c = data.customer;
        setFormData({
          email: c.email || "",
          firstName: c.first_name || "",
          lastName: c.last_name || "",
          phone: c.phone || "",
          status: c.status || "active",
          notes: c.notes || "",
          tags: Array.isArray(c.tags) ? c.tags : [],
          externalCustomerId: c.external_customer_id || "",
          acceptsEmailMarketing: Boolean(c.accepts_email_marketing),
          acceptsSmsMarketing: Boolean(c.accepts_sms_marketing),
          taxExempt: Boolean(c.tax_exempt),
          addresses: (c.addresses || []).map((addr: any) => ({
            title: addr.type === "shipping" ? "Teslimat" : "Fatura",
            company: addr.company || "",
            firstName: addr.first_name || "",
            lastName: addr.last_name || "",
            phone: addr.phone || "",
            city: addr.city || "",
            district: addr.state || "",
            addressLine: addr.address_line1 || "",
            addressLine2: addr.address_line2 || "",
            postalCode: addr.postal_code || "",
            country: addr.country || "TR",
          })),
        });
      }
    } catch (error) {
      console.error("Failed to load customer:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);

    try {
      if (customerId) {
        await fetch("/api/customers", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: customerId,
            ...formData,
          }),
        });
      } else {
        await fetch("/api/customers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formData),
        });
      }

      router.push("/admin/musteriler");
    } catch (error) {
      console.error("Failed to save customer:", error);
      alert("Müşteri kaydedilirken bir hata oluştu.");
    } finally {
      setSaving(false);
    }
  };

  const handleAddAddress = () => {
    setFormData({
      ...formData,
      addresses: [
        ...formData.addresses,
        {
          title: "Yeni Adres",
          company: "",
          firstName: formData.firstName,
          lastName: formData.lastName,
          phone: formData.phone || "",
          city: "",
          district: "",
          addressLine: "",
          addressLine2: "",
          postalCode: "",
          country: "TR",
        },
      ],
    });
  };

  const handleRemoveAddress = (index: number) => {
    setFormData({
      ...formData,
      addresses: formData.addresses.filter((_, i) => i !== index),
    });
  };

  const handleAddressChange = (index: number, field: keyof AddressInput, value: string) => {
    const newAddresses = [...formData.addresses];
    newAddresses[index] = { ...newAddresses[index], [field]: value };
    setFormData({ ...formData, addresses: newAddresses });
  };

  const handleAddTag = () => {
    if (tagInput.trim() && !formData.tags?.includes(tagInput.trim())) {
      setFormData({
        ...formData,
        tags: [...(formData.tags || []), tagInput.trim()],
      });
      setTagInput("");
    }
  };

  const handleTagKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleAddTag();
    }
  };

  const handleRemoveTag = (tag: string) => {
    setFormData({
      ...formData,
      tags: formData.tags?.filter((t) => t !== tag),
    });
  };

  const pageTitle = title || (customerId ? "Müşteriyi Düzenle" : "Yeni Müşteri");

  if (loading) {
    return (
      <main className="min-h-screen bg-[#F9F9F9]">
        <div className="flex min-h-[420px] items-center justify-center px-4 py-10">
          <div className="inline-flex items-center gap-3 rounded-[7px] border border-[#FFD7BF] bg-white px-4 py-2.5 text-sm font-semibold text-[#E85D04]">
            <Loader2 className="h-4 w-4 animate-spin text-[#FF6A00]" />
            Müşteri bilgileri hazırlanıyor
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#F9F9F9]">
      <div className="w-full px-0 py-3 md:py-5">
        <form id="customer-form" onSubmit={handleSubmit} className="space-y-4">
          <AdminPageHeader
            sectionLabel="Müşteri"
            title={pageTitle}
            description="Müşteri kaydını ve iletişim tercihlerini düzenleyin."
            actions={
              <>
                <Link href="/admin/musteriler" aria-label="Müşterilere dön" className={secondaryActionClass}>
                  <ArrowLeft className="h-4 w-4" />
                  Müşteriler
                </Link>
                <button type="submit" form="customer-form" disabled={saving} className={primaryActionClass}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Kaydet
                </button>
              </>
            }
          />

          <div className="grid grid-cols-1 gap-4 pt-2 min-[1025px]:pt-4 xl:grid-cols-[minmax(0,1.48fr)_minmax(300px,0.72fr)]">
            <div className="space-y-4">
              <section className={panelClass}>
                <div className={sectionHeaderClass}>
                  <div className="flex items-center gap-3">
                    <div className={sectionIconClass}>
                      <User className="h-4 w-4" />
                    </div>
                    <div>
                      <h2 className="text-base font-semibold tracking-[-0.02em] text-[#111827]">Kişisel Bilgiler</h2>
                      <p className="text-sm text-[#6B7280]">Temel iletişim ve kimlik alanları.</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-4 px-4 py-4 md:px-6">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <label htmlFor="customer-first-name" className={labelClass}>
                        Ad
                      </label>
                      <input
                        id="customer-first-name"
                        type="text"
                        value={formData.firstName}
                        onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                        className={inputClass}
                        required
                      />
                    </div>
                    <div>
                      <label htmlFor="customer-last-name" className={labelClass}>
                        Soyad
                      </label>
                      <input
                        id="customer-last-name"
                        type="text"
                        value={formData.lastName}
                        onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                        className={inputClass}
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="customer-email" className={labelClass}>
                      E-posta
                    </label>
                    <div className="relative">
                      <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                      <input
                        id="customer-email"
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        className={`${inputClass} pl-11`}
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="customer-phone" className={labelClass}>
                      Telefon
                    </label>
                    <div className="relative">
                      <Phone className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                      <input
                        id="customer-phone"
                        type="tel"
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        className={`${inputClass} pl-11`}
                        placeholder="05XXXXXXXXX"
                      />
                    </div>
                  </div>
                </div>
              </section>

              <section className={panelClass}>
                <div className={`${sectionHeaderClass} flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between`}>
                  <div className="flex items-center gap-3">
                    <div className={sectionIconClass}>
                      <MapPin className="h-4 w-4" />
                    </div>
                    <div>
                      <h2 className="text-base font-semibold tracking-[-0.02em] text-[#111827]">Adresler</h2>
                      <p className="text-sm text-[#6B7280]">Teslimat ve fatura adresleri.</p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleAddAddress}
                    className={secondaryActionClass}
                  >
                    <Plus className="h-4 w-4" />
                    Adres Ekle
                  </button>
                </div>

                <div className="space-y-3 px-4 py-4 md:px-6">
                  {formData.addresses.length === 0 ? (
                    <div className="rounded-[7px] border border-dashed border-[#FFD7BF] bg-white px-4 py-6 text-center text-sm font-medium text-[#6B7280]">
                      Henüz adres eklenmedi.
                    </div>
                  ) : null}

                  {formData.addresses.map((address, index) => (
                    <section
                      key={index}
                      className="rounded-[7px] border border-[#E1E6EF] bg-white p-4"
                      aria-label={`Adres ${index + 1}`}
                    >
                      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="inline-flex w-fit items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-[#E85D04]">
                          <span className="h-1.5 w-1.5 rounded-full bg-[#FF6A00]" aria-hidden="true" />
                          Adres {index + 1}
                        </div>
                        {formData.addresses.length > 1 ? (
                          <button
                            type="button"
                            onClick={() => handleRemoveAddress(index)}
                            className="inline-flex h-8 items-center justify-center gap-2 rounded-[6px] px-2 text-sm font-semibold text-rose-600 transition hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rose-200"
                          >
                            <Trash2 className="h-4 w-4" />
                            Kaldır
                          </button>
                        ) : null}
                      </div>

                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div className="md:col-span-2">
                          <label htmlFor={`address-title-${index}`} className={labelClass}>
                            Adres Başlığı
                          </label>
                          <input
                            id={`address-title-${index}`}
                            type="text"
                            value={address.title}
                            onChange={(e) => handleAddressChange(index, "title", e.target.value)}
                            className={inputClass}
                            placeholder="Ev, Ofis, Depo"
                          />
                        </div>

                        <div>
                          <label htmlFor={`address-first-name-${index}`} className={labelClass}>
                            Ad
                          </label>
                          <input
                            id={`address-first-name-${index}`}
                            type="text"
                            value={address.firstName}
                            onChange={(e) => handleAddressChange(index, "firstName", e.target.value)}
                            className={inputClass}
                          />
                        </div>
                        <div>
                          <label htmlFor={`address-last-name-${index}`} className={labelClass}>
                            Soyad
                          </label>
                          <input
                            id={`address-last-name-${index}`}
                            type="text"
                            value={address.lastName}
                            onChange={(e) => handleAddressChange(index, "lastName", e.target.value)}
                            className={inputClass}
                          />
                        </div>

                        <div className="md:col-span-2">
                          <label htmlFor={`address-company-${index}`} className={labelClass}>
                            Firma
                          </label>
                          <input
                            id={`address-company-${index}`}
                            type="text"
                            value={address.company}
                            onChange={(e) => handleAddressChange(index, "company", e.target.value)}
                            className={inputClass}
                            placeholder="Opsiyonel"
                          />
                        </div>

                        <div className="md:col-span-2">
                          <label htmlFor={`address-line-1-${index}`} className={labelClass}>
                            Adres
                          </label>
                          <input
                            id={`address-line-1-${index}`}
                            type="text"
                            value={address.addressLine}
                            onChange={(e) => handleAddressChange(index, "addressLine", e.target.value)}
                            className={inputClass}
                            required
                          />
                        </div>

                        <div className="md:col-span-2">
                          <label htmlFor={`address-line-2-${index}`} className={labelClass}>
                            Adres Satırı 2
                          </label>
                          <input
                            id={`address-line-2-${index}`}
                            type="text"
                            value={address.addressLine2}
                            onChange={(e) => handleAddressChange(index, "addressLine2", e.target.value)}
                            className={inputClass}
                            placeholder="Apartman, kat, daire"
                          />
                        </div>

                        <div>
                          <label htmlFor={`address-city-${index}`} className={labelClass}>
                            Şehir
                          </label>
                          <input
                            id={`address-city-${index}`}
                            type="text"
                            value={address.city}
                            onChange={(e) => handleAddressChange(index, "city", e.target.value)}
                            className={inputClass}
                            required
                          />
                        </div>
                        <div>
                          <label htmlFor={`address-district-${index}`} className={labelClass}>
                            İlçe
                          </label>
                          <input
                            id={`address-district-${index}`}
                            type="text"
                            value={address.district}
                            onChange={(e) => handleAddressChange(index, "district", e.target.value)}
                            className={inputClass}
                            required
                          />
                        </div>

                        <div>
                          <label htmlFor={`address-postal-code-${index}`} className={labelClass}>
                            Posta Kodu
                          </label>
                          <input
                            id={`address-postal-code-${index}`}
                            type="text"
                            value={address.postalCode}
                            onChange={(e) => handleAddressChange(index, "postalCode", e.target.value)}
                            className={inputClass}
                          />
                        </div>
                        <div>
                          <label htmlFor={`address-phone-${index}`} className={labelClass}>
                            Telefon
                          </label>
                          <input
                            id={`address-phone-${index}`}
                            type="tel"
                            value={address.phone}
                            onChange={(e) => handleAddressChange(index, "phone", e.target.value)}
                            className={inputClass}
                          />
                        </div>

                        <div className="md:col-span-2">
                          <label htmlFor={`address-country-${index}`} className={labelClass}>
                            Ülke
                          </label>
                          <input
                            id={`address-country-${index}`}
                            type="text"
                            value={address.country}
                            onChange={(e) => handleAddressChange(index, "country", e.target.value)}
                            className={inputClass}
                          />
                        </div>
                      </div>
                    </section>
                  ))}
                </div>
              </section>
            </div>

            <div className="space-y-4 xl:self-start">
              <section className={panelClass}>
                <div className={sectionHeaderClass}>
                  <div className="flex items-center gap-3">
                    <div className={sectionIconClass}>
                      <ShieldCheck className="h-4 w-4" />
                    </div>
                    <div>
                      <h2 className="text-base font-semibold tracking-[-0.02em] text-[#111827]">Durum ve Ayarlar</h2>
                      <p className="text-sm text-[#6B7280]">Görünüm ve iletişim tercihleri.</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-4 px-4 py-4 md:px-6">
                  <div className="space-y-2" role="radiogroup" aria-label="Müşteri durumu">
                    {statusOptions.map((option) => {
                      const checked = formData.status === option.value;

                      return (
                        <label
                          key={option.value}
                          className={`flex cursor-pointer items-center justify-between gap-3 rounded-[7px] border px-3 py-2.5 transition ${
                            checked
                              ? "border-[#FFD7BF] bg-[#FFF1E8]"
                              : "border-[#E1E6EF] bg-white hover:border-[#FFD7BF]"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className={`h-2 w-2 rounded-full ${checked ? "bg-[#FF6A00]" : "bg-[#CBD5E1]"}`}
                              aria-hidden="true"
                            />
                            <div className="text-sm font-semibold text-[#111827]">{option.label}</div>
                          </div>
                          <div className={`rounded-[5px] border px-2 py-0.5 text-[11px] font-semibold ${option.tone}`}>
                            {option.label}
                          </div>
                          <input
                            type="radio"
                            name="status"
                            value={option.value}
                            checked={checked}
                            onChange={(e) => setFormData({ ...formData, status: e.target.value as CustomerFormData["status"] })}
                            className="h-4 w-4 border-[#DDE3EC] text-[#FF6A00] focus:ring-[#FF6A00]"
                          />
                        </label>
                      );
                    })}
                  </div>

                  <div>
                    <label htmlFor="external-customer-id" className={labelClass}>
                      Harici Müşteri ID
                    </label>
                    <input
                      id="external-customer-id"
                      type="text"
                      value={formData.externalCustomerId}
                      onChange={(e) => setFormData({ ...formData, externalCustomerId: e.target.value })}
                      className={inputClass}
                      placeholder="CRM veya ERP referansı"
                    />
                  </div>

                  <div className="space-y-3">
                    <ToggleCard
                      checked={formData.acceptsEmailMarketing}
                      label="E-posta pazarlaması"
                      onChange={(checked) => setFormData({ ...formData, acceptsEmailMarketing: checked })}
                    />
                    <ToggleCard
                      checked={formData.acceptsSmsMarketing}
                      label="SMS pazarlaması"
                      onChange={(checked) => setFormData({ ...formData, acceptsSmsMarketing: checked })}
                    />
                    <ToggleCard
                      checked={formData.taxExempt}
                      label="Vergiden muaf"
                      onChange={(checked) => setFormData({ ...formData, taxExempt: checked })}
                    />
                  </div>
                </div>
              </section>

              <section className={panelClass}>
                <div className={sectionHeaderClass}>
                  <div className="flex items-center gap-3">
                    <div className={sectionIconClass}>
                      <Tags className="h-4 w-4" />
                    </div>
                    <div>
                      <h2 className="text-base font-semibold tracking-[-0.02em] text-[#111827]">Etiketler ve Notlar</h2>
                      <p className="text-sm text-[#6B7280]">Segment ve ekip notları.</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-4 px-4 py-4 md:px-6">
                  <div>
                    <label htmlFor="customer-tag-input" className={labelClass}>
                      Etiket ekle
                    </label>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <input
                        id="customer-tag-input"
                        type="text"
                        value={tagInput}
                        onChange={(e) => setTagInput(e.target.value)}
                        onKeyDown={handleTagKeyDown}
                        placeholder="VIP, Toptan, İstanbul"
                        className={inputClass}
                      />
                      <button
                        type="button"
                        onClick={handleAddTag}
                        className={`${secondaryActionClass} shrink-0`}
                      >
                        <Plus className="h-4 w-4" />
                        Ekle
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {formData.tags?.length ? (
                      formData.tags.map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center gap-2 rounded-[6px] border border-[#FFD7BF] bg-[#FFF1E8] px-2.5 py-1 text-sm font-semibold text-[#E85D04]"
                        >
                          {tag}
                          <button
                            type="button"
                            aria-label={`${tag} etiketini kaldır`}
                            onClick={() => handleRemoveTag(tag)}
                            className="inline-flex h-5 w-5 items-center justify-center rounded-[5px] text-[#B45309] transition hover:bg-white hover:text-rose-600"
                          >
                            x
                          </button>
                        </span>
                      ))
                    ) : (
                      <div className="rounded-[7px] border border-dashed border-[#FFD7BF] bg-white px-3 py-3 text-sm font-medium text-[#6B7280]">
                        Henüz etiket eklenmedi.
                      </div>
                    )}
                  </div>

                  <div>
                    <label htmlFor="customer-notes" className={labelClass}>
                      Notlar
                    </label>
                    <textarea
                      id="customer-notes"
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      rows={6}
                      className={`${inputClass} h-auto min-h-32 resize-y py-3`}
                      placeholder="Müşteri hakkında ekip içi notlar"
                    />
                  </div>
                </div>
              </section>
            </div>
          </div>
        </form>
      </div>
    </main>
  );
}

function ToggleCard({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-[7px] border border-[#E1E6EF] bg-white px-3 py-2.5 transition hover:border-[#FFD7BF]">
      <span className="text-sm font-semibold text-[#374151]">{label}</span>
      <div className="flex items-center gap-2">
        <span
          className={`rounded-[5px] border px-2 py-0.5 text-[11px] font-semibold ${
            checked
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-stone-200 bg-stone-50 text-stone-600"
          }`}
        >
          {checked ? "Açık" : "Kapalı"}
        </span>
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          className="h-4 w-4 rounded border-[#DDE3EC] text-[#FF6A00] focus:ring-[#FF6A00]"
        />
      </div>
    </label>
  );
}
