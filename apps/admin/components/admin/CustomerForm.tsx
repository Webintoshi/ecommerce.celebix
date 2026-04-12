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
  "rounded-[28px] border border-[#FE6100]/10 bg-gradient-to-br from-white via-[#fffdfb] to-[#faf5f0] shadow-[0_18px_55px_rgba(0,0,0,0.08)]";

const inputClass =
  "w-full rounded-2xl border border-[#e8d8ca] bg-white/90 px-4 py-3 text-sm text-gray-900 shadow-sm transition-all placeholder:text-gray-400 focus:border-[#FE6100] focus:bg-white focus:outline-none focus:ring-4 focus:ring-[#FE6100]/15";

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
      <main className="min-h-screen bg-gradient-to-br from-[#faf8f5] via-[#f5f0eb] to-[#efe5dc]">
        <div className="mx-auto flex min-h-[420px] max-w-[1600px] items-center justify-center px-4 py-10 md:px-6 lg:px-8">
          <div className="inline-flex items-center gap-3 rounded-full border border-[#FE6100]/15 bg-white/90 px-5 py-3 text-sm font-medium text-[#8a4b22] shadow-sm">
            <Loader2 className="h-4 w-4 animate-spin text-[#FE6100]" />
            Müşteri bilgileri hazırlanıyor
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-[#faf8f5] via-[#f5f0eb] to-[#efe5dc]">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-24 right-[-5rem] h-[22rem] w-[22rem] rounded-full bg-gradient-to-br from-[#FE6100]/12 via-[#FFB067]/8 to-transparent blur-3xl" />
        <div className="absolute bottom-[-8rem] left-[-4rem] h-[20rem] w-[20rem] rounded-full bg-gradient-to-tr from-amber-200/20 via-orange-100/10 to-transparent blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-[1600px] px-4 py-6 md:px-6 md:py-8 lg:px-8">
        <form onSubmit={handleSubmit} className="space-y-6">
          <section className="overflow-hidden rounded-[30px] border border-[#FE6100]/10 bg-gradient-to-br from-white via-[#fffdfb] to-[#faf5f0] shadow-[0_24px_80px_rgba(254,97,0,0.12)]">
            <div className="flex flex-col gap-4 border-b border-[#FE6100]/8 px-5 py-5 md:px-8 md:py-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-3 md:gap-4">
                <Link
                  href="/admin/musteriler"
                  aria-label="Müşterilere dön"
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[#FE6100]/12 bg-white text-[#8a4b22] shadow-sm transition-all hover:border-[#FE6100]/25 hover:bg-[#fff7f1] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FE6100]/20"
                >
                  <ArrowLeft className="h-5 w-5" />
                </Link>
                <div className="inline-flex w-fit items-center rounded-full border border-[#FE6100]/20 bg-gradient-to-r from-[#FE6100]/10 to-[#FF8B3D]/5 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.24em] text-[#FE6100]">
                  {pageTitle}
                </div>
              </div>

              <button
                type="submit"
                disabled={saving}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#FE6100] to-[#E45700] px-5 py-3 text-sm font-semibold text-white shadow-[0_18px_35px_rgba(254,97,0,0.24)] transition hover:translate-y-[-1px] hover:from-[#f05c00] hover:to-[#d84f00] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FE6100]/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Kaydet
              </button>
            </div>
          </section>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.85fr)]">
            <div className="space-y-6">
              <section className={panelClass}>
                <div className="border-b border-[#FE6100]/8 px-5 py-5 md:px-6">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#FE6100]/12 bg-gradient-to-br from-[#fff1e7] to-white text-[#FE6100] shadow-sm">
                      <User className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold tracking-[-0.02em] text-gray-950">Kişisel Bilgiler</h2>
                      <p className="text-sm text-gray-500">Temel iletişim ve kimlik alanlarını düzenleyin.</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-5 p-5 md:p-6">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <label htmlFor="customer-first-name" className="mb-2 block text-sm font-medium text-gray-700">
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
                      <label htmlFor="customer-last-name" className="mb-2 block text-sm font-medium text-gray-700">
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
                    <label htmlFor="customer-email" className="mb-2 block text-sm font-medium text-gray-700">
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
                    <label htmlFor="customer-phone" className="mb-2 block text-sm font-medium text-gray-700">
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
                <div className="flex flex-col gap-4 border-b border-[#FE6100]/8 px-5 py-5 md:px-6 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#FE6100]/12 bg-gradient-to-br from-[#fff1e7] to-white text-[#FE6100] shadow-sm">
                      <MapPin className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold tracking-[-0.02em] text-gray-950">Adresler</h2>
                      <p className="text-sm text-gray-500">Teslimat ve fatura adreslerini mobil uyumlu kartlarla yönetin.</p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleAddAddress}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-[#FE6100]/15 bg-white px-4 py-3 text-sm font-medium text-[#8a4b22] shadow-sm transition-all hover:border-[#FE6100]/30 hover:bg-[#fff7f1] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FE6100]/20"
                  >
                    <Plus className="h-4 w-4" />
                    Adres Ekle
                  </button>
                </div>

                <div className="space-y-4 p-5 md:p-6">
                  {formData.addresses.length === 0 ? (
                    <div className="rounded-[24px] border border-dashed border-[#e8d7c7] bg-white/70 px-5 py-8 text-center text-sm text-[#8b7768]">
                      Henüz adres eklenmedi.
                    </div>
                  ) : null}

                  {formData.addresses.map((address, index) => (
                    <section
                      key={index}
                      className="rounded-[24px] border border-[#ecdccd] bg-white/80 p-4 shadow-sm sm:p-5"
                      aria-label={`Adres ${index + 1}`}
                    >
                      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="inline-flex w-fit items-center rounded-full border border-[#FE6100]/12 bg-[#fff8f3] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-[#FE6100]">
                          Adres {index + 1}
                        </div>
                        {formData.addresses.length > 1 ? (
                          <button
                            type="button"
                            onClick={() => handleRemoveAddress(index)}
                            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rose-200"
                          >
                            <Trash2 className="h-4 w-4" />
                            Kaldır
                          </button>
                        ) : null}
                      </div>

                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div className="md:col-span-2">
                          <label htmlFor={`address-title-${index}`} className="mb-2 block text-sm font-medium text-gray-700">
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
                          <label htmlFor={`address-first-name-${index}`} className="mb-2 block text-sm font-medium text-gray-700">
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
                          <label htmlFor={`address-last-name-${index}`} className="mb-2 block text-sm font-medium text-gray-700">
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
                          <label htmlFor={`address-company-${index}`} className="mb-2 block text-sm font-medium text-gray-700">
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
                          <label htmlFor={`address-line-1-${index}`} className="mb-2 block text-sm font-medium text-gray-700">
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
                          <label htmlFor={`address-line-2-${index}`} className="mb-2 block text-sm font-medium text-gray-700">
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
                          <label htmlFor={`address-city-${index}`} className="mb-2 block text-sm font-medium text-gray-700">
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
                          <label htmlFor={`address-district-${index}`} className="mb-2 block text-sm font-medium text-gray-700">
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
                          <label htmlFor={`address-postal-code-${index}`} className="mb-2 block text-sm font-medium text-gray-700">
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
                          <label htmlFor={`address-phone-${index}`} className="mb-2 block text-sm font-medium text-gray-700">
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
                          <label htmlFor={`address-country-${index}`} className="mb-2 block text-sm font-medium text-gray-700">
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

            <div className="space-y-6">
              <section className={panelClass}>
                <div className="border-b border-[#FE6100]/8 px-5 py-5 md:px-6">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#FE6100]/12 bg-gradient-to-br from-[#fff1e7] to-white text-[#FE6100] shadow-sm">
                      <ShieldCheck className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold tracking-[-0.02em] text-gray-950">Durum ve Ayarlar</h2>
                      <p className="text-sm text-gray-500">Müşterinin yönetim görünümünü ve tercihlerini belirleyin.</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-5 p-5 md:p-6">
                  <div className="space-y-3" role="radiogroup" aria-label="Müşteri durumu">
                    {statusOptions.map((option) => {
                      const checked = formData.status === option.value;

                      return (
                        <label
                          key={option.value}
                          className={`flex cursor-pointer items-center justify-between gap-4 rounded-[22px] border px-4 py-3 transition-all ${
                            checked
                              ? "border-[#FE6100]/30 bg-[#fff8f3] shadow-sm"
                              : "border-[#ecdccd] bg-white/80 hover:border-[#FE6100]/15 hover:bg-white"
                          }`}
                        >
                          <div>
                            <div className="text-sm font-semibold text-gray-900">{option.label}</div>
                          </div>
                          <div className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${option.tone}`}>
                            {option.label}
                          </div>
                          <input
                            type="radio"
                            name="status"
                            value={option.value}
                            checked={checked}
                            onChange={(e) => setFormData({ ...formData, status: e.target.value as CustomerFormData["status"] })}
                            className="h-4 w-4 border-[#d8c3b1] text-[#FE6100] focus:ring-[#FE6100]"
                          />
                        </label>
                      );
                    })}
                  </div>

                  <div>
                    <label htmlFor="external-customer-id" className="mb-2 block text-sm font-medium text-gray-700">
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
                <div className="border-b border-[#FE6100]/8 px-5 py-5 md:px-6">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#FE6100]/12 bg-gradient-to-br from-[#fff1e7] to-white text-[#FE6100] shadow-sm">
                      <Tags className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold tracking-[-0.02em] text-gray-950">Etiketler ve Notlar</h2>
                      <p className="text-sm text-gray-500">Ek segmentler ve ekip notları için düzenli alanlar.</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-5 p-5 md:p-6">
                  <div>
                    <label htmlFor="customer-tag-input" className="mb-2 block text-sm font-medium text-gray-700">
                      Etiket ekle
                    </label>
                    <div className="flex flex-col gap-3 sm:flex-row">
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
                        className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-2xl border border-[#FE6100]/15 bg-white px-4 py-3 text-sm font-medium text-[#8a4b22] shadow-sm transition-all hover:border-[#FE6100]/30 hover:bg-[#fff7f1] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FE6100]/20"
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
                          className="inline-flex items-center gap-2 rounded-full border border-[#FE6100]/15 bg-[#fff8f3] px-3 py-1.5 text-sm font-medium text-[#8a4b22]"
                        >
                          {tag}
                          <button
                            type="button"
                            aria-label={`${tag} etiketini kaldır`}
                            onClick={() => handleRemoveTag(tag)}
                            className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[#a7643c] transition hover:bg-[#ffe8d8] hover:text-rose-600"
                          >
                            x
                          </button>
                        </span>
                      ))
                    ) : (
                      <div className="rounded-[20px] border border-dashed border-[#e8d7c7] bg-white/70 px-4 py-4 text-sm text-[#8b7768]">
                        Henüz etiket eklenmedi.
                      </div>
                    )}
                  </div>

                  <div>
                    <label htmlFor="customer-notes" className="mb-2 block text-sm font-medium text-gray-700">
                      Notlar
                    </label>
                    <textarea
                      id="customer-notes"
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      rows={6}
                      className={`${inputClass} resize-y`}
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
    <label className="flex cursor-pointer items-center justify-between gap-4 rounded-[22px] border border-[#ecdccd] bg-white/80 px-4 py-3 transition-all hover:border-[#FE6100]/15 hover:bg-white">
      <span className="text-sm font-medium text-gray-800">{label}</span>
      <div className="flex items-center gap-3">
        <span
          className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
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
          className="h-4 w-4 rounded border-[#d8c3b1] text-[#FE6100] focus:ring-[#FE6100]"
        />
      </div>
    </label>
  );
}
