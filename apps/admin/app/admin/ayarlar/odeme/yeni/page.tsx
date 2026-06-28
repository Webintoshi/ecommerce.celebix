"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { CheckCircle2, RefreshCw, Save } from "lucide-react";
import { toast } from "sonner";
import { AdminPageHeader, AdminPageShell } from "@/components/admin/AdminPageShell";
import { PaymentProviderLogo } from "@/components/admin/payment-provider-logo";
import { PaymentGatewayForm } from "@/components/admin/payment-gateway-form";
import { PAYMENT_PROVIDER_REGISTRY } from "@/lib/payment-providers";
import { addPaymentGateway, getDefaultPaymentGatewayConfig, validatePaymentGatewayConfig } from "@/lib/payments";
import type { PaymentGateway, PaymentGatewayFormState } from "@/types/payment";

export default function NewPaymentGatewayPage() {
  const router = useRouter();
  const [selectedGateway, setSelectedGateway] = useState<PaymentGateway | "">("");
  const [formData, setFormData] = useState<PaymentGatewayFormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const selectedDefinition = useMemo(
    () => PAYMENT_PROVIDER_REGISTRY.find((provider) => provider.id === selectedGateway),
    [selectedGateway],
  );

  function handleGatewaySelect(gateway: PaymentGateway) {
    setSelectedGateway(gateway);
    setFormData(getDefaultPaymentGatewayConfig(gateway));
    setErrors([]);
  }

  async function handleSave() {
    if (!selectedGateway || !formData) {
      toast.error("Lütfen bir ödeme altyapısı seçin.");
      return;
    }

    const validationErrors = validatePaymentGatewayConfig(formData, selectedGateway);
    setErrors(validationErrors);

    if (validationErrors.length > 0) {
      toast.error("Formdaki zorunlu alanları düzeltin.");
      return;
    }

    setSaving(true);
    try {
      await addPaymentGateway(formData);
      toast.success("\u00d6deme altyap\u0131s\u0131 eklendi.");
      router.push("/admin/ayarlar/odeme");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Kayıt sırasında hata oluştu.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#F9F9F9] pb-8 text-[#111827]">
      <div className="mx-auto w-full max-w-none space-y-4 px-4 sm:px-5 xl:px-6">
        <AdminPageShell>
          <AdminPageHeader
            sectionLabel="Ayarlar"
            title="Yeni ödeme"
            actions={
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || !formData}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-[8px] bg-[#FF6A00] px-4 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(255,106,0,0.16)] transition hover:bg-[#E85D04] disabled:cursor-not-allowed disabled:opacity-45"
              >
                {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {saving ? "Kaydediliyor" : "Kaydet"}
              </button>
            }
          />

          {!selectedGateway || !formData ? (
            <section className="overflow-hidden rounded-[12px] border border-[#DCE3EC] bg-white shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-[#DCE3EC] bg-[#EEF3F7] px-4 py-3 xl:px-5">
                <div>
                  <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-[#4B5563]">Sağlayıcı seç</h2>
                </div>
                <span className="rounded-[8px] bg-white px-3 py-1.5 text-xs font-semibold text-[#6B7280]">
                  {PAYMENT_PROVIDER_REGISTRY.length} seçenek
                </span>
              </div>

              <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3 xl:p-5">
                {PAYMENT_PROVIDER_REGISTRY.map((provider) => (
                  <button
                    key={provider.id}
                    type="button"
                    onClick={() => handleGatewaySelect(provider.id)}
                    className="group grid min-h-[96px] grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-3 rounded-[10px] border border-[#DCE3EC] bg-white p-3 text-left transition hover:border-[#FFD1B5] hover:bg-[#FFF8F3] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.16)]"
                  >
                    <PaymentProviderLogo
                      gateway={provider.id}
                      name={provider.name}
                      accentClassName={provider.accentClassName}
                      size={44}
                      iconClassName="h-5 w-5"
                      containerClassName="h-11 w-11 border border-[#DCE3EC] bg-[#F9F9F9]"
                    />
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-semibold text-[#111827]">{provider.name}</h3>
                      <p className="mt-1 text-xs font-semibold text-[#8B95A5]">
                        {getProviderCategoryLabel(provider.category)}
                      </p>
                    </div>
                    <span className="grid h-7 w-7 place-items-center rounded-full border border-[#FFD1B5] text-[#FF6A00] opacity-0 transition group-hover:opacity-100">
                      <CheckCircle2 className="h-4 w-4" />
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ) : (
            <div className="space-y-4">
              {selectedDefinition && (
                <section className="grid gap-3 rounded-[12px] border border-[#DCE3EC] bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.04)] min-[820px]:grid-cols-[minmax(0,1fr)_auto] min-[820px]:items-center xl:p-5">
                  <div className="flex min-w-0 items-center gap-3">
                    <PaymentProviderLogo
                      gateway={selectedDefinition.id}
                      name={selectedDefinition.name}
                      accentClassName={selectedDefinition.accentClassName}
                      size={46}
                      iconClassName="h-5 w-5"
                      containerClassName="h-[46px] w-[46px] border border-[#DCE3EC] bg-[#F9F9F9]"
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8B95A5]">Seçili sağlayıcı</p>
                      <h2 className="mt-1 truncate text-base font-semibold text-[#111827]">{selectedDefinition.name}</h2>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedGateway("");
                      setFormData(null);
                      setErrors([]);
                    }}
                    className="inline-flex h-10 items-center justify-center rounded-[8px] border border-[#DCE3EC] bg-white px-4 text-sm font-semibold text-[#4B5563] transition hover:border-[#FFD1B5] hover:bg-[#FFF8F3] hover:text-[#E85D04]"
                  >
                    Değiştir
                  </button>
                </section>
              )}

              <PaymentGatewayForm
                gateway={formData}
                errors={errors}
                onChange={setFormData}
                compact
              />
            </div>
          )}
        </AdminPageShell>
      </div>
    </main>
  );
}

function getProviderCategoryLabel(category: string) {
  switch (category) {
    case "card":
      return "Kartlı ödeme";
    case "bank":
      return "Banka";
    case "wallet":
      return "Cüzdan";
    case "cash":
      return "Kapıda ödeme";
    default:
      return "Ödeme";
  }
}
