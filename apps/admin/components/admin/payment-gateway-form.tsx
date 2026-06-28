"use client";

import { Lock, Settings, Wallet } from "lucide-react";
import {
    getDefaultIyzicoBaseUrl,
    getPaymentProviderDefinition,
    IYZICO_PRODUCTION_BASE_URL,
    IYZICO_SANDBOX_BASE_URL,
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
    compact?: boolean;
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

export function PaymentGatewayForm({ gateway, errors = [], onChange, compact = false }: PaymentGatewayFormProps) {
    const definition = getPaymentProviderDefinition(gateway.gateway);
    const sectionClass = compact
        ? "overflow-hidden rounded-[12px] border border-[#DCE3EC] bg-white shadow-[0_12px_30px_rgba(15,23,42,0.04)]"
        : "overflow-hidden rounded-[8px] border border-gray-200 bg-white shadow-sm";
    const sectionHeaderClass = compact
        ? "flex items-center gap-3 border-b border-[#DCE3EC] bg-[#EEF3F7] px-4 py-3 xl:px-5"
        : "flex items-center gap-3 border-b border-gray-100 bg-[var(--admin-bg)] px-6 py-4";
    const sectionBodyClass = compact ? "space-y-4 p-4 xl:p-5" : "space-y-4 p-6";
    const sectionBodyGridClass = compact ? "grid grid-cols-1 gap-4 p-4 md:grid-cols-2 xl:p-5" : "grid grid-cols-1 gap-4 p-6 md:grid-cols-2";
    const headerIconClass = compact
        ? "grid h-9 w-9 place-items-center rounded-[8px] border border-[#DCE3EC] bg-white text-[#FF6A00]"
        : "rounded-lg border border-gray-100 bg-white p-2 shadow-sm";
    const headerTitleClass = compact
        ? "text-sm font-semibold uppercase tracking-[0.12em] text-[#4B5563]"
        : "font-semibold text-gray-900";
    const labelClass = compact
        ? "mb-1 block text-xs font-semibold uppercase tracking-[0.1em] text-[#6B7280]"
        : "mb-1 block text-sm font-medium text-gray-700";
    const inputClass = compact
        ? "h-11 w-full rounded-[8px] border border-[#DCE3EC] bg-white px-3 text-sm font-semibold text-[#111827] outline-none transition placeholder:text-[#9CA3AF] focus:border-[#FFD1B5] focus:ring-4 focus:ring-[rgba(255,106,0,0.14)]"
        : "w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-900";
    const selectClass = compact
        ? "h-11 w-full rounded-[8px] border border-[#DCE3EC] bg-white px-3 text-sm font-semibold text-[#111827] outline-none transition focus:border-[#FFD1B5] focus:ring-4 focus:ring-[rgba(255,106,0,0.14)]"
        : "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-900";
    const textareaClass = compact
        ? "min-h-20 w-full resize-none rounded-[8px] border border-[#DCE3EC] bg-white px-3 py-2 text-sm font-semibold text-[#111827] outline-none transition placeholder:text-[#9CA3AF] focus:border-[#FFD1B5] focus:ring-4 focus:ring-[rgba(255,106,0,0.14)]"
        : "w-full resize-none rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-900";
    const providerBadgeClass = compact
        ? "inline-flex h-9 items-center rounded-[8px] border border-[#FFD1B5] bg-[#FFF8F3] px-3 text-sm font-semibold text-[#E85D04]"
        : "inline-flex rounded-lg border border-[#FFD1B5] bg-[#FFF8F3] px-3 py-2 text-sm font-medium text-[#E85D04]";

    function update(patch: Partial<PaymentGatewayConfig>) {
        onChange({ ...gateway, ...patch });
    }

    function handleEnvironmentChange(nextEnvironment: PaymentGatewayConfig["environment"]) {
        const nextPatch: Partial<PaymentGatewayConfig> = { environment: nextEnvironment };

        if (gateway.gateway === "iyzico") {
            const currentBaseUrl = gateway.configuration.baseUrl?.trim() ?? "";
            if (!currentBaseUrl || currentBaseUrl === IYZICO_SANDBOX_BASE_URL || currentBaseUrl === IYZICO_PRODUCTION_BASE_URL) {
                nextPatch.configuration = {
                    ...gateway.configuration,
                    baseUrl: getDefaultIyzicoBaseUrl(nextEnvironment),
                };
            }
        }

        update(nextPatch);
    }

    return (
        <div className="space-y-6">
            {errors.length > 0 && (
                <div className="rounded-[8px] border border-red-200 bg-red-50 p-4">
                    <h3 className="text-sm font-semibold text-red-800">Form hataları</h3>
                    <ul className="mt-2 list-disc pl-5 text-sm text-red-700">
                        {errors.map((error) => (
                            <li key={error}>{error}</li>
                        ))}
                    </ul>
                </div>
            )}

            <div className={sectionClass}>
                <div className={sectionHeaderClass}>
                    <div className={headerIconClass}>
                        <Settings className="h-4 w-4" />
                    </div>
                    <h2 className={headerTitleClass}>Temel bilgiler</h2>
                </div>
                <div className={sectionBodyClass}>
                    <div>
                        <label className={labelClass}>Sağlayıcı</label>
                        <div className={providerBadgeClass}>
                            {definition.name}
                        </div>
                    </div>

                    <div>
                        <label className={labelClass}>Görünen Ad</label>
                        <input
                            type="text"
                            value={gateway.name}
                            onChange={(event) => update({ name: event.target.value })}
                            className={inputClass}
                        />
                    </div>

                    <div>
                        <label className={labelClass}>Açıklama</label>
                        <textarea
                            value={gateway.description}
                            onChange={(event) => update({ description: event.target.value })}
                            rows={compact ? 2 : 3}
                            className={textareaClass}
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className={labelClass}>Durum</label>
                            <select
                                value={gateway.status}
                                onChange={(event) => update({ status: event.target.value as PaymentGatewayConfig["status"] })}
                                className={selectClass}
                            >
                                <option value="inactive">Pasif</option>
                                <option value="test">Test Modu</option>
                                <option value="active">Aktif</option>
                            </select>
                        </div>

                        <div>
                            <label className={labelClass}>Ortam</label>
                            <select
                                value={gateway.environment}
                                onChange={(event) => handleEnvironmentChange(event.target.value as PaymentGatewayConfig["environment"])}
                                className={selectClass}
                            >
                                <option value="sandbox">Test Ortamı</option>
                                <option value="production">Canlı Ortam</option>
                            </select>
                        </div>
                    </div>
                </div>
            </div>

            {(definition.credentialFields.length > 0 || definition.configurationFields.length > 0) && (
                <div className={sectionClass}>
                    <div className={sectionHeaderClass}>
                        <div className={headerIconClass}>
                            <Lock className="h-4 w-4" />
                        </div>
                        <h2 className={headerTitleClass}>API ayarları</h2>
                    </div>
                    <div className={compact ? "space-y-5 p-4 xl:p-5" : "space-y-6 p-6"}>
                        {definition.credentialFields.length > 0 && (
                            <div className="space-y-4">
                                <h3 className="text-sm font-semibold text-[#111827]">Kimlik bilgileri</h3>
                                {definition.credentialFields.map((field) => (
                                    <div key={field.key}>
                                        <label className={labelClass}>
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
                                            className={inputClass}
                                        />
                                        {!compact && field.description ? (
                                            <p className="mt-1 text-xs text-gray-500">{field.description}</p>
                                        ) : null}
                                    </div>
                                ))}
                            </div>
                        )}

                        {definition.configurationFields.length > 0 && (
                            <div className="space-y-4">
                                <h3 className="text-sm font-semibold text-[#111827]">Konfigürasyon</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {definition.configurationFields.map((field) => (
                                        <div key={field.key}>
                                            <label className={labelClass}>
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
                                                    className={selectClass}
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
                                                    className={inputClass}
                                                />
                                            )}
                                            {!compact && field.description ? (
                                                <p className="mt-1 text-xs text-gray-500">{field.description}</p>
                                            ) : null}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {gateway.gateway === "bank_transfer" && (
                <div className={sectionClass}>
                    <div className={sectionHeaderClass}>
                        <div className={headerIconClass}>
                            <Wallet className="h-4 w-4" />
                        </div>
                        <h2 className={headerTitleClass}>Banka hesabı</h2>
                    </div>
                    <div className={sectionBodyGridClass}>
                        <div>
                            <label className={labelClass}>Banka Adı</label>
                            <input
                                type="text"
                                value={gateway.bankAccount.bankName}
                                onChange={(event) => update({ bankAccount: { ...gateway.bankAccount, bankName: event.target.value } })}
                                className={inputClass}
                            />
                        </div>
                        <div>
                            <label className={labelClass}>IBAN</label>
                            <input
                                type="text"
                                value={gateway.bankAccount.iban}
                                onChange={(event) => update({ bankAccount: { ...gateway.bankAccount, iban: event.target.value } })}
                                className={`${inputClass} font-mono`}
                            />
                        </div>
                        <div>
                            <label className={labelClass}>Hesap Sahibi</label>
                            <input
                                type="text"
                                value={gateway.bankAccount.accountHolder}
                                onChange={(event) => update({ bankAccount: { ...gateway.bankAccount, accountHolder: event.target.value } })}
                                className={inputClass}
                            />
                        </div>
                        <div>
                            <label className={labelClass}>SWIFT</label>
                            <input
                                type="text"
                                value={gateway.bankAccount.swift}
                                onChange={(event) => update({ bankAccount: { ...gateway.bankAccount, swift: event.target.value } })}
                                className={inputClass}
                            />
                        </div>
                        <div>
                            <label className={labelClass}>Para Birimi</label>
                            <select
                                value={gateway.bankAccount.currency}
                                onChange={(event) => update({ bankAccount: { ...gateway.bankAccount, currency: event.target.value } })}
                                className={selectClass}
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
                <div className={sectionClass}>
                    <div className={sectionHeaderClass}>
                        <h2 className={headerTitleClass}>Kapıda ödeme</h2>
                    </div>
                    <div className={sectionBodyGridClass}>
                        <div>
                            <label className={labelClass}>Min Tutar</label>
                            <input
                                type="number"
                                value={gateway.codSettings.minOrderAmount}
                                onChange={(event) => update({ codSettings: { ...gateway.codSettings, minOrderAmount: Number(event.target.value) } })}
                                className={inputClass}
                            />
                        </div>
                        <div>
                            <label className={labelClass}>Max Tutar</label>
                            <input
                                type="number"
                                value={gateway.codSettings.maxOrderAmount}
                                onChange={(event) => update({ codSettings: { ...gateway.codSettings, maxOrderAmount: Number(event.target.value) } })}
                                className={inputClass}
                            />
                        </div>
                        <div className="md:col-span-2">
                            <label className={labelClass}>Uygulama Talimatı</label>
                            <textarea
                                rows={3}
                                value={gateway.codSettings.instructions}
                                onChange={(event) => update({ codSettings: { ...gateway.codSettings, instructions: event.target.value } })}
                                className={textareaClass}
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
