"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle, RefreshCw, Save, TriangleAlert } from "lucide-react";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { PaymentGatewayForm } from "@/components/admin/payment-gateway-form";
import {
    getPaymentGatewayRuntimeStatus,
    getPaymentProviderDefinition,
} from "@/lib/payment-providers";
import {
    getPaymentGatewayById,
    getPaymentGateways,
    testPaymentGatewayConnection,
    updatePaymentGateway,
    validatePaymentGatewayConfig,
} from "@/lib/payments";
import { PaymentGatewayConfig } from "@/types/payment";

export default function EditPaymentGatewayPage() {
    const router = useRouter();
    const params = useParams();
    const gatewayId = params.id as string;

    const [gateway, setGateway] = useState<PaymentGatewayConfig | null>(null);
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState<boolean | null>(null);
    const [errors, setErrors] = useState<string[]>([]);

    useEffect(() => {
        let isMounted = true;

        async function loadGateway() {
            await getPaymentGateways();
            const current = getPaymentGatewayById(gatewayId);

            if (!isMounted) {
                return;
            }

            if (!current) {
                router.push("/admin/ayarlar/odeme");
                return;
            }

            setGateway(current);
        }

        loadGateway();

        return () => {
            isMounted = false;
        };
    }, [gatewayId, router]);

    const provider = useMemo(
        () => (gateway ? getPaymentProviderDefinition(gateway.gateway) : null),
        [gateway],
    );
    const runtimeStatus = useMemo(
        () => (gateway ? getPaymentGatewayRuntimeStatus(gateway) : null),
        [gateway],
    );

    async function handleSave() {
        if (!gateway) {
            return;
        }

        const validationErrors = validatePaymentGatewayConfig(gateway, gateway.gateway);
        setErrors(validationErrors);
        if (validationErrors.length > 0) {
            return;
        }

        setSaving(true);
        try {
            await updatePaymentGateway(gatewayId, gateway);
            router.push("/admin/ayarlar/odeme");
            router.refresh();
        } finally {
            setSaving(false);
        }
    }

    async function handleTest() {
        if (!gateway) {
            return;
        }

        setTesting(true);
        const success = await testPaymentGatewayConnection(gatewayId);
        setTestResult(success);
        setTesting(false);
    }

    if (!gateway || !provider) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
            </div>
        );
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
                        <h1 className="text-2xl font-bold text-gray-900">Odeme Altyapisini Duzenle</h1>
                        <p className="text-sm text-gray-500 mt-1">{gateway.name} kaydini guncelleyin.</p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={handleTest}
                        disabled={testing}
                        className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-all shadow-sm disabled:opacity-50 text-sm font-medium"
                    >
                        {testing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <TriangleAlert className="w-4 h-4" />}
                        {testing ? "Test ediliyor..." : "Baglantiyi Test Et"}
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="flex items-center gap-2 px-6 py-2 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 transition-all shadow-sm disabled:opacity-50 text-sm"
                    >
                        {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        {saving ? "Kaydediliyor..." : "Kaydet"}
                    </button>
                </div>
            </div>

            {testResult !== null && (
                <div className={`rounded-xl p-4 flex items-center gap-2 text-sm font-medium ${testResult
                    ? "bg-green-50 border border-green-200 text-green-700"
                    : "bg-red-50 border border-red-200 text-red-700"
                    }`}>
                    {testResult ? <CheckCircle className="w-5 h-5" /> : <TriangleAlert className="w-5 h-5" />}
                    {testResult ? "Saglayici baglanti testi basarili." : "Saglayici baglanti testi basarisiz."}
                </div>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-8">
                <PaymentGatewayForm gateway={gateway} onChange={setGateway} errors={errors} />

                <aside className="space-y-6">
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                        <h3 className="font-semibold text-gray-900 mb-4">Saglayici Ozet</h3>
                        <div className="space-y-3 text-sm">
                            <div className="flex justify-between gap-4">
                                <span className="text-gray-500">Saglayici</span>
                                <span className="font-medium text-gray-900">{provider.name}</span>
                            </div>
                            <div className="flex justify-between gap-4">
                                <span className="text-gray-500">Kategori</span>
                                <span className="font-medium text-gray-900">{provider.category}</span>
                            </div>
                            <div className="flex justify-between gap-4">
                                <span className="text-gray-500">Durum</span>
                                <span className="font-medium text-gray-900">{gateway.status}</span>
                            </div>
                            <div className="flex justify-between gap-4">
                                <span className="text-gray-500">Ortam</span>
                                <span className="font-medium text-gray-900">{gateway.environment}</span>
                            </div>
                            {runtimeStatus && (
                                <div className="flex justify-between gap-4">
                                    <span className="text-gray-500">Runtime</span>
                                    <span className={`font-medium ${runtimeStatus.isReady ? "text-emerald-700" : "text-amber-700"}`}>
                                        {runtimeStatus.label}
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>

                    {runtimeStatus && (
                        <div className={`rounded-xl border p-4 text-sm ${runtimeStatus.isReady ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
                            {runtimeStatus.message}
                        </div>
                    )}

                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                        <h3 className="font-semibold text-gray-900 mb-4">Kayit Bilgisi</h3>
                        <div className="space-y-3 text-sm">
                            <div className="flex justify-between gap-4">
                                <span className="text-gray-500">Olusturulma</span>
                                <span className="font-medium text-gray-900">{format(new Date(gateway.createdAt), "dd MMM yyyy", { locale: tr })}</span>
                            </div>
                            <div className="flex justify-between gap-4">
                                <span className="text-gray-500">Son Guncelleme</span>
                                <span className="font-medium text-gray-900">{format(new Date(gateway.updatedAt), "dd MMM yyyy", { locale: tr })}</span>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                        <h3 className="font-semibold text-gray-900 mb-4">Dis Baglantilar</h3>
                        <div className="flex flex-col gap-3">
                            <a href={provider.homepageUrl} target="_blank" rel="noreferrer" className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50">
                                Web Sitesi
                            </a>
                            {provider.docsUrl && (
                                <a href={provider.docsUrl} target="_blank" rel="noreferrer" className="px-4 py-2 rounded-lg bg-gray-900 text-sm font-medium text-white hover:bg-gray-800">
                                    Dokumantasyon
                                </a>
                            )}
                        </div>
                    </div>
                </aside>
            </div>
        </div>
    );
}
