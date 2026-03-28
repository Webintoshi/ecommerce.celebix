"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
    AlertTriangle,
    Building2,
    CheckCircle,
    CreditCard,
    DollarSign,
    Edit,
    Filter,
    Package,
    Plus,
    RefreshCw,
    Search,
    Shield,
    TestTube,
    Trash2,
    TrendingUp,
    Zap,
} from "lucide-react";
import { getPaymentGatewayRuntimeStatus } from "@/lib/payment-providers";
import {
    deletePaymentGateway,
    duplicatePaymentGateway,
    getPaymentGateways,
    getPaymentGatewayStats,
    testPaymentGatewayConnection,
    togglePaymentGatewayStatus,
} from "@/lib/payments";
import { PaymentEnvironment, PaymentGateway, PaymentGatewayConfig, PaymentMethodStatus } from "@/types/payment";

export default function PaymentSettingsPage() {
    const [paymentGateways, setPaymentGateways] = useState<PaymentGatewayConfig[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState<PaymentMethodStatus | "all">("all");
    const [testingConnection, setTestingConnection] = useState<string | null>(null);
    const [testResults, setTestResults] = useState<Record<string, boolean>>({});

    const loadPaymentGateways = async () => {
        setLoading(true);
        const gateways = await getPaymentGateways();
        setPaymentGateways(gateways);
        setLoading(false);
    };

    useEffect(() => {
        async function initialize() {
            const gateways = await getPaymentGateways();
            setPaymentGateways(gateways);
            setLoading(false);
        }

        void initialize();
    }, []);

    const handleToggleStatus = async (id: string, currentStatus: PaymentMethodStatus) => {
        const newStatus = currentStatus === "active" ? "inactive" : "active";
        await togglePaymentGatewayStatus(id, newStatus);
        loadPaymentGateways();
    };

    const handleDelete = async (id: string) => {
        if (confirm("Bu odeme yontemini silmek istediginizden emin misiniz? Bu islem geri alinamaz.")) {
            await deletePaymentGateway(id);
            loadPaymentGateways();
        }
    };

    const handleDuplicate = async (id: string) => {
        await duplicatePaymentGateway(id);
        loadPaymentGateways();
    };

    const handleTestConnection = async (id: string) => {
        setTestingConnection(id);
        const success = await testPaymentGatewayConnection(id);
        setTestResults((prev) => ({ ...prev, [id]: success }));
        setTestingConnection(null);
    };

    const filteredGateways = paymentGateways.filter((gateway) => {
        const matchesSearch =
            gateway.name.toLowerCase().includes(searchQuery.toLowerCase())
            || gateway.description?.toLowerCase().includes(searchQuery.toLowerCase());

        const matchesStatus = statusFilter === "all" || gateway.status === statusFilter;

        return matchesSearch && matchesStatus;
    });

    const stats = getPaymentGatewayStats();
    const runtimeReadyCount = paymentGateways.filter((gateway) => getPaymentGatewayRuntimeStatus(gateway).isReady).length;

    const getStatusColor = (status: PaymentMethodStatus) => {
        switch (status) {
            case "active":
                return "bg-green-100 text-green-700 border-green-200";
            case "inactive":
                return "bg-red-100 text-red-700 border-red-200";
            case "test":
                return "bg-yellow-100 text-yellow-700 border-yellow-200";
            default:
                return "bg-gray-100 text-gray-700 border-gray-200";
        }
    };

    const getStatusLabel = (status: PaymentMethodStatus) => {
        switch (status) {
            case "active":
                return "Aktif";
            case "inactive":
                return "Pasif";
            case "test":
                return "Test Modu";
            default:
                return status;
        }
    };

    const getEnvironmentColor = (env: PaymentEnvironment) => {
        return env === "production"
            ? "bg-red-100 text-red-700"
            : "bg-blue-100 text-blue-700";
    };

    const getGatewayIcon = (gateway: PaymentGateway) => {
        switch (gateway) {
            case "iyzico":
            case "bank_transfer":
                return Building2;
            case "stripe":
                return DollarSign;
            case "cod":
                return Package;
            default:
                return CreditCard;
        }
    };

    return (
        <div className="min-h-screen max-w-7xl mx-auto space-y-8 bg-gray-50/50 p-6 md:p-8">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-gray-900">Odeme Yontemleri</h1>
                    <p className="mt-1 text-sm text-gray-500">Odeme saglayicilarini yapilandirin, test edin ve checkout hazirligini takip edin.</p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={loadPaymentGateways}
                        className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm transition-all hover:bg-gray-50"
                        title="Yenile"
                    >
                        <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                    </button>
                    <Link
                        href="/admin/ayarlar/odeme/yeni"
                        className="flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-gray-800"
                    >
                        <Plus className="h-4 w-4" />
                        Yeni Yontem Ekle
                    </Link>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
                <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                    <div className="mb-2 flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                            <CreditCard className="h-4 w-4" />
                        </div>
                        <div className="text-xl font-bold text-gray-900">{stats.total}</div>
                    </div>
                    <div className="text-xs font-medium text-gray-500">Toplam Yontem</div>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                    <div className="mb-2 flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-50 text-green-600">
                            <CheckCircle className="h-4 w-4" />
                        </div>
                        <div className="text-xl font-bold text-gray-900">{stats.active}</div>
                    </div>
                    <div className="text-xs font-medium text-gray-500">Aktif</div>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                    <div className="mb-2 flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-yellow-50 text-yellow-600">
                            <TestTube className="h-4 w-4" />
                        </div>
                        <div className="text-xl font-bold text-gray-900">{stats.testMode}</div>
                    </div>
                    <div className="text-xs font-medium text-gray-500">Test Modu</div>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                    <div className="mb-2 flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-50 text-red-600">
                            <Shield className="h-4 w-4" />
                        </div>
                        <div className="text-xl font-bold text-gray-900">{stats.production}</div>
                    </div>
                    <div className="text-xs font-medium text-gray-500">Canli Ortam</div>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                    <div className="mb-2 flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                            <TrendingUp className="h-4 w-4" />
                        </div>
                        <div className="text-xl font-bold text-gray-900">{stats.sandbox}</div>
                    </div>
                    <div className="text-xs font-medium text-gray-500">Test Ortami</div>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                    <div className="mb-2 flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                            <Shield className="h-4 w-4" />
                        </div>
                        <div className="text-xl font-bold text-gray-900">{runtimeReadyCount}</div>
                    </div>
                    <div className="text-xs font-medium text-gray-500">Checkout&apos;ta Kullanilabilir</div>
                </div>
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                <div className="flex items-start gap-3">
                    <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-700" />
                    <div className="text-sm text-amber-800">
                        Kartli saglayicilar icin API kaydi tek basina yeterli degildir. Canli checkout&apos;ta gorunmeleri icin payment runtime tablolari, provider init akisi ve callback/webhook dogrulamasi tamamlanmis olmalidir.
                    </div>
                </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="flex flex-col items-center gap-4 md:flex-row">
                    <div className="relative w-full flex-1">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Odeme yontemi ara..."
                            value={searchQuery}
                            onChange={(event) => setSearchQuery(event.target.value)}
                            className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-9 pr-3 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-gray-900"
                        />
                    </div>
                    <div className="relative w-full md:w-48">
                        <Filter className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                        <select
                            value={statusFilter}
                            onChange={(event) => setStatusFilter(event.target.value as PaymentMethodStatus | "all")}
                            className="w-full cursor-pointer appearance-none rounded-lg border border-gray-200 bg-gray-50 py-2 pl-9 pr-8 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-gray-900"
                        >
                            <option value="all">Tum Durumlar</option>
                            <option value="active">Aktif</option>
                            <option value="inactive">Pasif</option>
                            <option value="test">Test Modu</option>
                        </select>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                {filteredGateways.map((gateway) => {
                    const GatewayIcon = getGatewayIcon(gateway.gateway);
                    const runtimeStatus = getPaymentGatewayRuntimeStatus(gateway);

                    return (
                        <div
                            key={gateway.id}
                            className="flex flex-col rounded-xl border border-gray-200 bg-white shadow-sm transition-all hover:shadow-md"
                        >
                            <div className="flex-1 p-6">
                                <div className="mb-4 flex items-start justify-between">
                                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gray-50">
                                        <GatewayIcon className="h-6 w-6 text-gray-700" />
                                    </div>
                                    <button
                                        onClick={() => handleToggleStatus(gateway.id, gateway.status)}
                                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2 ${gateway.status === "active" ? "bg-green-600" : "bg-gray-200"}`}
                                    >
                                        <span
                                            className={`${gateway.status === "active" ? "translate-x-6" : "translate-x-1"} inline-block h-4 w-4 transform rounded-full bg-white transition-transform`}
                                        />
                                    </button>
                                </div>

                                <div className="mb-4">
                                    <h3 className="mb-1 text-lg font-bold text-gray-900">{gateway.name}</h3>
                                    {gateway.description && (
                                        <p className="line-clamp-2 text-sm text-gray-500">{gateway.description}</p>
                                    )}
                                </div>

                                <div className="mb-4 flex flex-wrap gap-2">
                                    <span className={`inline-flex items-center rounded px-2 py-1 text-xs font-medium ${getStatusColor(gateway.status)}`}>
                                        {getStatusLabel(gateway.status)}
                                    </span>
                                    <span className={`inline-flex items-center rounded px-2 py-1 text-xs font-medium ${getEnvironmentColor(gateway.environment)}`}>
                                        {gateway.environment === "production" ? "Canli" : "Test"}
                                    </span>
                                    <span className={`inline-flex items-center rounded px-2 py-1 text-xs font-medium ${runtimeStatus.isReady ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                                        {runtimeStatus.label}
                                    </span>
                                </div>

                                {!runtimeStatus.isReady && (
                                    <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                                        {runtimeStatus.message}
                                    </div>
                                )}

                                <div className="mb-4">
                                    <div className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">Desteklenen Yontemler</div>
                                    <div className="flex flex-wrap gap-1.5">
                                        {gateway.supportedMethods?.map((method) => (
                                            <span
                                                key={method}
                                                className="rounded border border-gray-200 bg-gray-100 px-2 py-0.5 text-[10px] text-gray-600"
                                            >
                                                {method}
                                            </span>
                                        ))}
                                    </div>
                                </div>

                                {testResults[gateway.id] !== undefined && (
                                    <div className={`mb-4 flex items-center gap-2 rounded-lg p-2 text-xs font-medium ${testResults[gateway.id] ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                                        {testResults[gateway.id] ? (
                                            <>
                                                <CheckCircle className="h-3.5 w-3.5" />
                                                Baglanti testi basarili
                                            </>
                                        ) : (
                                            <>
                                                <AlertTriangle className="h-3.5 w-3.5" />
                                                Baglanti testi basarisiz
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div className="grid grid-cols-2 gap-2 rounded-b-xl border-t border-gray-100 bg-gray-50/30 p-4">
                                <button
                                    onClick={() => handleTestConnection(gateway.id)}
                                    disabled={testingConnection === gateway.id}
                                    className="flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 transition-all hover:bg-gray-50 disabled:opacity-50"
                                >
                                    {testingConnection === gateway.id ? (
                                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                        <Zap className="h-3.5 w-3.5" />
                                    )}
                                    Test Et
                                </button>

                                <Link
                                    href={`/admin/ayarlar/odeme/${gateway.id}/duzenle`}
                                    className="flex items-center justify-center gap-1.5 rounded-lg border border-gray-900 bg-gray-900 px-3 py-2 text-xs font-medium text-white transition-all hover:bg-gray-800"
                                >
                                    <Edit className="h-3.5 w-3.5" />
                                    Duzenle
                                </Link>

                                <button
                                    onClick={() => handleDuplicate(gateway.id)}
                                    className="col-span-1 flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs text-gray-500 transition-all hover:bg-gray-100 hover:text-gray-900"
                                    title="Kopyala"
                                >
                                    Kopyala
                                </button>

                                <button
                                    onClick={() => handleDelete(gateway.id)}
                                    className="col-span-1 flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs text-red-500 transition-all hover:bg-red-50 hover:text-red-700"
                                    title="Sil"
                                >
                                    <Trash2 className="h-3.5 w-3.5" />
                                    Sil
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>

            {filteredGateways.length === 0 && (
                <div className="rounded-xl border border-gray-200 bg-white p-12 text-center shadow-sm">
                    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
                        <CreditCard className="h-8 w-8 text-gray-400" />
                    </div>
                    <h3 className="mb-2 text-lg font-bold text-gray-900">Odeme Yontemi Bulunamadi</h3>
                    <p className="mx-auto mb-6 max-w-sm text-sm text-gray-500">
                        Henuz odeme yontemi yapilandirmadiniz. Ilk odeme yonteminizi ekleyerek ayar kaydini olusturun.
                    </p>
                    <Link
                        href="/admin/ayarlar/odeme/yeni"
                        className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-medium text-white transition-all hover:bg-gray-800"
                    >
                        <Plus className="h-4 w-4" />
                        Ilk Odeme Yontemini Ekle
                    </Link>
                </div>
            )}
        </div>
    );
}
