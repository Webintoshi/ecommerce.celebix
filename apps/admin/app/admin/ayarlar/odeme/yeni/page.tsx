"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Building2, CreditCard, Package, RefreshCw, Save, Waypoints } from "lucide-react";
import { toast } from "sonner";
import { PaymentGatewayForm } from "@/components/admin/payment-gateway-form";
import { PAYMENT_PROVIDER_REGISTRY } from "@/lib/payment-providers";
import { addPaymentGateway, getDefaultPaymentGatewayConfig, validatePaymentGatewayConfig } from "@/lib/payments";
import { PaymentGateway, PaymentGatewayFormState } from "@/types/payment";

const PAYMENT_LOGO_PATHS: Record<PaymentGateway, string> = {
    paytr: "/payment-logos/paytr.png",
    iyzico: "/payment-logos/iyzico.png",
    paynet: "/payment-logos/paynet.png",
    craftgate: "/payment-logos/craftgate.png",
    stripe: "/payment-logos/stripe.png",
    bank_transfer: "/payment-logos/bank-transfer.png",
    cod: "/payment-logos/cod.png",
};

const GATEWAY_ICONS = {
    paytr: CreditCard,
    iyzico: CreditCard,
    paynet: CreditCard,
    craftgate: Waypoints,
    stripe: CreditCard,
    bank_transfer: Building2,
    cod: Package,
} satisfies Record<PaymentGateway, typeof CreditCard>;

function PaymentProviderLogo({
    gateway,
    name,
    accentClassName,
    size,
    iconClassName,
}: {
    gateway: PaymentGateway;
    name: string;
    accentClassName: string;
    size: number;
    iconClassName: string;
}) {
    const Icon = GATEWAY_ICONS[gateway];
    const [hasError, setHasError] = useState(false);
    const src = PAYMENT_LOGO_PATHS[gateway];

    if (!src || hasError) {
        return (
            <div className={`h-full w-full bg-gradient-to-r ${accentClassName} rounded-xl flex items-center justify-center shadow-sm text-white`}>
                <Icon className={iconClassName} />
            </div>
        );
    }

    return (
        <div className="h-full w-full rounded-xl flex items-center justify-center bg-white shadow-sm overflow-hidden">
            <Image
                src={src}
                alt={name}
                width={size}
                height={size}
                className="h-full w-full object-contain"
                onError={() => setHasError(true)}
            />
        </div>
    );
}

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
            toast.error("Lutfen bir odeme altyapisi secin.");
            return;
        }

        const validationErrors = validatePaymentGatewayConfig(formData, selectedGateway);
        setErrors(validationErrors);
        if (validationErrors.length > 0) {
            toast.error("Formdaki zorunlu alanlari duzeltin.");
            return;
        }

        setSaving(true);
        try {
            await addPaymentGateway(formData);
            toast.success("Odeme altyapisi eklendi.");
            router.push("/admin/ayarlar/odeme");
            router.refresh();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Kayit sirasinda hata olustu.");
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="min-h-screen bg-gray-50/50 p-6 md:p-8 space-y-8 max-w-7xl mx-auto">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Link
                        href="/admin/ayarlar/odeme"
                        className="flex items-center gap-2 px-3 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-all text-sm font-medium"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        Geri Don
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">Yeni Odeme Altyapisi</h1>
                        <p className="text-sm text-gray-500 mt-1">
                            Turkiye&apos;de yaygin odeme saglayicilarini veya manuel odeme yontemlerini ekleyin.
                        </p>
                    </div>
                </div>

                <button
                    onClick={handleSave}
                    disabled={saving || !formData}
                    className="flex items-center gap-2 px-6 py-2 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                    {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {saving ? "Kaydediliyor..." : "Kaydet"}
                </button>
            </div>

            {!selectedGateway || !formData ? (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
                    <div className="mb-6">
                        <h2 className="text-xl font-bold text-gray-900 mb-1">Odeme Saglayicisi Secin</h2>
                        <p className="text-gray-500 text-sm">
                            Resmi hesabinizi actiktan sonra gerekli API bilgilerinizle kayit olusturun.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                        {PAYMENT_PROVIDER_REGISTRY.map((provider) => {
                            return (
                                <button
                                    key={provider.id}
                                    onClick={() => handleGatewaySelect(provider.id)}
                                    className="p-6 border border-gray-200 rounded-xl text-left hover:border-gray-900 hover:shadow-md transition-all group bg-gray-50/30"
                                >
                                    <div className="w-12 h-12 mb-4">
                                        <PaymentProviderLogo
                                            gateway={provider.id}
                                            name={provider.name}
                                            accentClassName={provider.accentClassName}
                                            size={48}
                                            iconClassName="w-6 h-6"
                                        />
                                    </div>
                                    <h3 className="font-bold text-gray-900 mb-1 group-hover:text-blue-600 transition-colors">
                                        {provider.name}
                                    </h3>
                                    <p className="text-xs text-gray-500">{provider.description}</p>
                                    <div className="mt-3 flex flex-wrap gap-2">
                                        {provider.supportedMethods.slice(0, 3).map((method) => (
                                            <span key={method} className="px-2 py-0.5 bg-gray-100 text-gray-600 text-[10px] rounded-full">
                                                {method}
                                            </span>
                                        ))}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>
            ) : (
                <div className="space-y-6">
                    {selectedDefinition && (
                        <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                            <div className="flex items-center gap-4">
                                <div className="w-14 h-14 shrink-0">
                                    <PaymentProviderLogo
                                        gateway={selectedDefinition.id}
                                        name={selectedDefinition.name}
                                        accentClassName={selectedDefinition.accentClassName}
                                        size={56}
                                        iconClassName="w-7 h-7"
                                    />
                                </div>
                                <div>
                                    <p className="text-sm font-semibold text-gray-900">{selectedDefinition.name}</p>
                                    <p className="text-sm text-gray-500 mt-1">{selectedDefinition.description}</p>
                                </div>
                            </div>
                            <div className="flex gap-3">
                                <a
                                    href={selectedDefinition.homepageUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50"
                                >
                                    Web Sitesi
                                </a>
                                {selectedDefinition.docsUrl && (
                                    <a
                                        href={selectedDefinition.docsUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="px-4 py-2 rounded-lg bg-gray-900 text-sm font-medium text-white hover:bg-gray-800"
                                    >
                                        Dokumantasyon
                                    </a>
                                )}
                            </div>
                        </div>
                    )}

                    <PaymentGatewayForm
                        gateway={formData}
                        errors={errors}
                        onChange={setFormData}
                    />
                </div>
            )}
        </div>
    );
}
