"use client";

import { Lock, Settings, Wallet } from "lucide-react";
import {
    getPaymentGatewayRuntimeStatus,
    getPaymentProviderDefinition,
} from "@/lib/payment-providers";
import {
    CURRENCIES,
    PaymentGatewayConfig,
    PaymentGatewayFormState,
} from "@/types/payment";

interface PaymentGatewayFormProps {
    gateway: PaymentGatewayFormState;
    errors?: string[];
    onChange: (next: PaymentGatewayFormState) => void;
}

function renderFieldType(type?: string, secret?: boolean) {
    if (type === "email") {
        return "email";
    }

    if (type === "url") {
        return "url";
    }

    if (type === "number") {
        return "number";
    }

    if (secret) {
        return "password";
    }

    return "text";
}

export function PaymentGatewayForm({ gateway, errors = [], onChange }: PaymentGatewayFormProps) {
    const definition = getPaymentProviderDefinition(gateway.gateway);
    const runtimeStatus = getPaymentGatewayRuntimeStatus(gateway);

    function update(patch: Partial<PaymentGatewayConfig>) {
        onChange({ ...gateway, ...patch });
    }

    return (
        <div className="space-y-6">
            <div className={`rounded-xl border p-4 ${runtimeStatus.isReady ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
                <div className="flex items-center justify-between gap-4">
                    <div>
                        <h3 className={`text-sm font-semibold ${runtimeStatus.isReady ? "text-emerald-800" : "text-amber-800"}`}>
                            Runtime Durumu: {runtimeStatus.label}
                        </h3>
                        <p className={`mt-1 text-sm ${runtimeStatus.isReady ? "text-emerald-700" : "text-amber-700"}`}>
                            {runtimeStatus.message}
                        </p>
                    </div>
                </div>
            </div>

            {errors.length > 0 && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                    <h3 className="text-sm font-semibold text-red-800">Form hatalari</h3>
                    <ul className="mt-2 list-disc pl-5 text-sm text-red-700">
                        {errors.map((error) => (
                            <li key={error}>{error}</li>
                        ))}
                    </ul>
                </div>
            )}

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex items-center gap-3">
                    <div className="p-2 bg-white rounded-lg shadow-sm border border-gray-100">
                        <Settings className="w-4 h-4 text-gray-600" />
                    </div>
                    <h2 className="font-semibold text-gray-900">Temel Bilgiler</h2>
                </div>
                <div className="p-6 space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Saglayici</label>
                        <div className="inline-flex rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700">
                            {definition.name}
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Gorunen Ad</label>
                        <input
                            type="text"
                            value={gateway.name}
                            onChange={(event) => update({ name: event.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Aciklama</label>
                        <textarea
                            value={gateway.description}
                            onChange={(event) => update({ description: event.target.value })}
                            rows={3}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none"
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Durum</label>
                            <select
                                value={gateway.status}
                                onChange={(event) => update({ status: event.target.value as PaymentGatewayConfig["status"] })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-gray-900"
                            >
                                <option value="inactive">Pasif</option>
                                <option value="test">Test Modu</option>
                                <option value="active">Aktif</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Ortam</label>
                            <select
                                value={gateway.environment}
                                onChange={(event) => update({ environment: event.target.value as PaymentGatewayConfig["environment"] })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-gray-900"
                            >
                                <option value="sandbox">Test Ortami</option>
                                <option value="production">Canli Ortam</option>
                            </select>
                        </div>
                    </div>
                </div>
            </div>

            {(definition.credentialFields.length > 0 || definition.configurationFields.length > 0) && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex items-center gap-3">
                        <div className="p-2 bg-white rounded-lg shadow-sm border border-gray-100">
                            <Lock className="w-4 h-4 text-gray-600" />
                        </div>
                        <h2 className="font-semibold text-gray-900">API ve Saglayici Ayarlari</h2>
                    </div>
                    <div className="p-6 space-y-6">
                        {definition.credentialFields.length > 0 && (
                            <div className="space-y-4">
                                <h3 className="text-sm font-semibold text-gray-900">Kimlik Bilgileri</h3>
                                {definition.credentialFields.map((field) => (
                                    <div key={field.key}>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            {field.label}{field.required ? " *" : ""}
                                        </label>
                                        <input
                                            type={renderFieldType(field.type, field.secret)}
                                            value={gateway.credentials[field.key] ?? ""}
                                            onChange={(event) => update({
                                                credentials: {
                                                    ...gateway.credentials,
                                                    [field.key]: event.target.value,
                                                },
                                            })}
                                            placeholder={field.placeholder}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
                                        />
                                        <p className="text-xs text-gray-500 mt-1">{field.description}</p>
                                    </div>
                                ))}
                            </div>
                        )}

                        {definition.configurationFields.length > 0 && (
                            <div className="space-y-4">
                                <h3 className="text-sm font-semibold text-gray-900">Saglayici Konfigurasyonu</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {definition.configurationFields.map((field) => (
                                        <div key={field.key}>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                {field.label}{field.required ? " *" : ""}
                                            </label>
                                            {field.type === "select" ? (
                                                <select
                                                    value={gateway.configuration[field.key] ?? ""}
                                                    onChange={(event) => update({
                                                        configuration: {
                                                            ...gateway.configuration,
                                                            [field.key]: event.target.value,
                                                        },
                                                    })}
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-gray-900"
                                                >
                                                    {(field.options ?? []).map((option) => (
                                                        <option key={option.value} value={option.value}>
                                                            {option.label}
                                                        </option>
                                                    ))}
                                                </select>
                                            ) : (
                                                <input
                                                    type={renderFieldType(field.type, field.secret)}
                                                    value={gateway.configuration[field.key] ?? ""}
                                                    onChange={(event) => update({
                                                        configuration: {
                                                            ...gateway.configuration,
                                                            [field.key]: event.target.value,
                                                        },
                                                    })}
                                                    placeholder={field.placeholder}
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
                                                />
                                            )}
                                            <p className="text-xs text-gray-500 mt-1">{field.description}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {gateway.gateway === "bank_transfer" && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex items-center gap-3">
                        <div className="p-2 bg-white rounded-lg shadow-sm border border-gray-100">
                            <Wallet className="w-4 h-4 text-gray-600" />
                        </div>
                        <h2 className="font-semibold text-gray-900">Banka Hesabi</h2>
                    </div>
                    <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Banka Adi</label>
                            <input
                                type="text"
                                value={gateway.bankAccount.bankName}
                                onChange={(event) => update({ bankAccount: { ...gateway.bankAccount, bankName: event.target.value } })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">IBAN</label>
                            <input
                                type="text"
                                value={gateway.bankAccount.iban}
                                onChange={(event) => update({ bankAccount: { ...gateway.bankAccount, iban: event.target.value } })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Hesap Sahibi</label>
                            <input
                                type="text"
                                value={gateway.bankAccount.accountHolder}
                                onChange={(event) => update({ bankAccount: { ...gateway.bankAccount, accountHolder: event.target.value } })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">SWIFT</label>
                            <input
                                type="text"
                                value={gateway.bankAccount.swift}
                                onChange={(event) => update({ bankAccount: { ...gateway.bankAccount, swift: event.target.value } })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Para Birimi</label>
                            <select
                                value={gateway.bankAccount.currency}
                                onChange={(event) => update({ bankAccount: { ...gateway.bankAccount, currency: event.target.value } })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white"
                            >
                                {CURRENCIES.map((currency) => (
                                    <option key={currency.value} value={currency.value}>
                                        {currency.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>
            )}

            {gateway.gateway === "cod" && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
                        <h2 className="font-semibold text-gray-900">Kapida Odeme Kurallari</h2>
                    </div>
                    <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Min Tutar</label>
                            <input
                                type="number"
                                value={gateway.codSettings.minOrderAmount}
                                onChange={(event) => update({ codSettings: { ...gateway.codSettings, minOrderAmount: Number(event.target.value) } })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Max Tutar</label>
                            <input
                                type="number"
                                value={gateway.codSettings.maxOrderAmount}
                                onChange={(event) => update({ codSettings: { ...gateway.codSettings, maxOrderAmount: Number(event.target.value) } })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                            />
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Uygulama Talimati</label>
                            <textarea
                                rows={3}
                                value={gateway.codSettings.instructions}
                                onChange={(event) => update({ codSettings: { ...gateway.codSettings, instructions: event.target.value } })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg resize-none"
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
