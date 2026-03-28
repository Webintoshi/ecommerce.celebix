"use client";

import { useState, useEffect } from "react";
import {
    Save,
    Mail,
    MessageSquare,
    Bell,
    CheckCircle,
    AlertTriangle,
    RefreshCw,
    Smartphone,
    Server,
    Globe
} from "lucide-react";
import {
    getNotificationSettings,
    updateNotificationSettings,
    testEmailConnection,
    testSMSConnection
} from "@/lib/notifications";
import { NotificationSettings, EmailConfig, SMSConfig } from "@/types/notification";

export default function NotificationSettingsPage() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<"email" | "sms" | "push">("email");
    const [settings, setSettings] = useState<NotificationSettings | null>(null);
    const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        try {
            const data = await getNotificationSettings();
            setSettings(data);
        } catch {
            console.error("Failed to load settings");
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        if (!settings) return;

        setSaving(true);
        try {
            await updateNotificationSettings(settings);
            // In a real app, show toast success
        } catch {
            console.error("Failed to save settings");
        } finally {
            setSaving(false);
        }
    };

    const handleTest = async (type: "email" | "sms") => {
        if (!settings) return;

        setTesting(type);
        setTestResult(null);

        try {
            let success = false;
            if (type === "email") {
                success = await testEmailConnection(settings.email);
            } else {
                success = await testSMSConnection(settings.sms);
            }

            setTestResult({
                success,
                message: success ? "Bağlantı testi başarılı!" : "Bağlantı kurulamadı, bilgileri kontrol edin."
            });
        } catch {
            setTestResult({ success: false, message: "Test sırasında bir hata oluştu." });
        } finally {
            setTesting(null);
        }
    };

    if (loading || !settings) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-8 h-8 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" />
                    <p className="text-gray-500 text-sm">Ayarlar yükleniyor...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50/50 p-6 md:p-8 space-y-8 max-w-5xl mx-auto">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Bildirim Ayarları</h1>
                    <p className="text-sm text-gray-500 mt-1">E-posta, SMS ve Push bildirim sağlayıcılarını yapılandırın.</p>
                </div>
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 transition-all shadow-sm disabled:opacity-50 text-sm"
                >
                    {saving ? (
                        <>
                            <RefreshCw className="w-4 h-4 animate-spin" />
                            Kaydediliyor...
                        </>
                    ) : (
                        <>
                            <Save className="w-4 h-4" />
                            Kaydet
                        </>
                    )}
                </button>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col md:flex-row min-h-[600px]">
                {/* Sidebar Navigation */}
                <div className="w-full md:w-64 bg-gray-50/50 border-r border-gray-100 p-4 space-y-2">
                    <button
                        onClick={() => setActiveTab("email")}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${activeTab === "email"
                            ? "bg-white text-blue-600 shadow-sm ring-1 ring-gray-200"
                            : "text-gray-600 hover:bg-white/50 hover:text-gray-900"
                            }`}
                    >
                        <Mail className="w-4 h-4" />
                        E-posta (SMTP)
                    </button>
                    <button
                        onClick={() => setActiveTab("sms")}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${activeTab === "sms"
                            ? "bg-white text-green-600 shadow-sm ring-1 ring-gray-200"
                            : "text-gray-600 hover:bg-white/50 hover:text-gray-900"
                            }`}
                    >
                        <MessageSquare className="w-4 h-4" />
                        SMS Gateway
                    </button>
                    <button
                        onClick={() => setActiveTab("push")}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${activeTab === "push"
                            ? "bg-white text-purple-600 shadow-sm ring-1 ring-gray-200"
                            : "text-gray-600 hover:bg-white/50 hover:text-gray-900"
                            }`}
                    >
                        <Bell className="w-4 h-4" />
                        Push Bildirimleri
                    </button>
                </div>

                {/* Content Area */}
                <div className="flex-1 p-6 md:p-8">
                    {/* Email Settings */}
                    {activeTab === "email" && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                            <div>
                                <h2 className="text-lg font-bold text-gray-900 mb-1">E-posta Ayarları</h2>
                                <p className="text-sm text-gray-500">Sistem bildirimleri ve pazarlama e-postaları için SMTP yapılandırması.</p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="md:col-span-2">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Sağlayıcı</label>
                                    <select
                                        value={settings.email.provider}
                                        onChange={(e) => setSettings({
                                            ...settings,
                                            email: { ...settings.email, provider: e.target.value as EmailConfig["provider"] }
                                        })}
                                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:bg-white transition-all"
                                    >
                                        <option value="smtp">Özel SMTP Sunucusu</option>
                                        <option value="aws-ses">Amazon SES</option>
                                        <option value="resend">Resend API</option>
                                    </select>
                                </div>

                                {settings.email.provider === "smtp" && (
                                    <>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">SMTP Sunucusu</label>
                                            <div className="relative">
                                                <Server className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                                <input
                                                    type="text"
                                                    value={settings.email.host || ""}
                                                    onChange={(e) => setSettings({
                                                        ...settings,
                                                        email: { ...settings.email, host: e.target.value }
                                                    })}
                                                    placeholder="smtp.example.com"
                                                    className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 transition-all"
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Port</label>
                                            <input
                                                type="number"
                                                value={settings.email.port || ""}
                                                onChange={(e) => setSettings({
                                                    ...settings,
                                                    email: { ...settings.email, port: parseInt(e.target.value) }
                                                })}
                                                placeholder="587"
                                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 transition-all"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Kullanıcı Adı</label>
                                            <input
                                                type="text"
                                                value={settings.email.user || ""}
                                                onChange={(e) => setSettings({
                                                    ...settings,
                                                    email: { ...settings.email, user: e.target.value }
                                                })}
                                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 transition-all"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Şifre</label>
                                            <input
                                                type="password"
                                                value={settings.email.password || ""}
                                                onChange={(e) => setSettings({
                                                    ...settings,
                                                    email: { ...settings.email, password: e.target.value }
                                                })}
                                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 transition-all"
                                            />
                                        </div>
                                    </>
                                )}

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Gönderen Adı</label>
                                    <input
                                        type="text"
                                        value={settings.email.senderName}
                                        onChange={(e) => setSettings({
                                            ...settings,
                                            email: { ...settings.email, senderName: e.target.value }
                                        })}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 transition-all"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Gönderen E-posta</label>
                                    <input
                                        type="email"
                                        value={settings.email.senderEmail}
                                        onChange={(e) => setSettings({
                                            ...settings,
                                            email: { ...settings.email, senderEmail: e.target.value }
                                        })}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 transition-all"
                                    />
                                </div>
                            </div>

                            <div className="pt-6 border-t border-gray-100">
                                <button
                                    onClick={() => handleTest("email")}
                                    disabled={testing === "email"}
                                    className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 rounded-lg text-sm font-medium hover:bg-blue-100 transition-all disabled:opacity-50"
                                >
                                    {testing === "email" ? (
                                        <RefreshCw className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <RefreshCw className="w-4 h-4" />
                                    )}
                                    Bağlantıyı Test Et
                                </button>
                                {testResult && activeTab === "email" && (
                                    <div className={`mt-3 flex items-center gap-2 text-sm ${testResult.success ? "text-green-600" : "text-red-600"}`}>
                                        {testResult.success ? <CheckCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                                        {testResult.message}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* SMS Settings */}
                    {activeTab === "sms" && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                            <div>
                                <h2 className="text-lg font-bold text-gray-900 mb-1">SMS Ayarları</h2>
                                <p className="text-sm text-gray-500">Sipariş bildirimleri ve doğrulama kodları için SMS yapılandırması.</p>
                            </div>

                            <div className="grid grid-cols-1 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">SMS Sağlayıcı</label>
                                    <select
                                        value={settings.sms.provider}
                                        onChange={(e) => setSettings({
                                            ...settings,
                                            sms: { ...settings.sms, provider: e.target.value as SMSConfig["provider"] }
                                        })}
                                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:bg-white transition-all"
                                    >
                                        <option value="netgsm">NetGSM</option>
                                        <option value="iletimerkezi">İleti Merkezi</option>
                                        <option value="twilio">Twilio</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Başlık (Sender ID)</label>
                                    <div className="relative">
                                        <Smartphone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                        <input
                                            type="text"
                                            value={settings.sms.senderTitle}
                                            onChange={(e) => setSettings({
                                                ...settings,
                                                sms: { ...settings.sms, senderTitle: e.target.value }
                                            })}
                                            maxLength={11}
                                            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 transition-all"
                                        />
                                    </div>
                                    <p className="text-xs text-gray-500 mt-1">Maksimum 11 karakter.</p>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">API Anahtarı / Kullanıcı Adı</label>
                                    <input
                                        type="text"
                                        value={settings.sms.apiKey}
                                        onChange={(e) => setSettings({
                                            ...settings,
                                            sms: { ...settings.sms, apiKey: e.target.value }
                                        })}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 transition-all"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">API Şifresi / Secret</label>
                                    <input
                                        type="password"
                                        value={settings.sms.apiSecret || ""}
                                        onChange={(e) => setSettings({
                                            ...settings,
                                            sms: { ...settings.sms, apiSecret: e.target.value }
                                        })}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 transition-all"
                                    />
                                </div>
                            </div>

                            <div className="pt-6 border-t border-gray-100">
                                <button
                                    onClick={() => handleTest("sms")}
                                    disabled={testing === "sms"}
                                    className="flex items-center gap-2 px-4 py-2 bg-green-50 text-green-700 rounded-lg text-sm font-medium hover:bg-green-100 transition-all disabled:opacity-50"
                                >
                                    {testing === "sms" ? (
                                        <RefreshCw className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <RefreshCw className="w-4 h-4" />
                                    )}
                                    SMS Testi Gönder
                                </button>
                                {testResult && activeTab === "sms" && (
                                    <div className={`mt-3 flex items-center gap-2 text-sm ${testResult.success ? "text-green-600" : "text-red-600"}`}>
                                        {testResult.success ? <CheckCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                                        {testResult.message}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Push Notification Settings */}
                    {activeTab === "push" && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                            <div>
                                <h2 className="text-lg font-bold text-gray-900 mb-1">Push Bildirimleri</h2>
                                <p className="text-sm text-gray-500">Mobil uygulama ve web push bildirimleri için Firebase yapılandırması.</p>
                            </div>

                            <div className="p-4 bg-purple-50 rounded-lg border border-purple-100 mb-6">
                                <div className="flex items-start gap-3">
                                    <Globe className="w-5 h-5 text-purple-600 mt-0.5" />
                                    <div className="text-sm text-purple-800">
                                        <p className="font-semibold mb-1">Firebase Cloud Messaging (FCM)</p>
                                        <p className="opacity-90">Anlık bildirimler için Firebase projesi gereklidir. Konsol üzerinden proje ayarlarını alıp buraya giriniz.</p>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="md:col-span-2">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">API Key</label>
                                    <input
                                        type="text"
                                        value={settings.push.apiKey}
                                        onChange={(e) => setSettings({
                                            ...settings,
                                            push: { ...settings.push, apiKey: e.target.value }
                                        })}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 font-mono"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Auth Domain</label>
                                    <input
                                        type="text"
                                        value={settings.push.authDomain}
                                        onChange={(e) => setSettings({
                                            ...settings,
                                            push: { ...settings.push, authDomain: e.target.value }
                                        })}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 font-mono"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Project ID</label>
                                    <input
                                        type="text"
                                        value={settings.push.projectId}
                                        onChange={(e) => setSettings({
                                            ...settings,
                                            push: { ...settings.push, projectId: e.target.value }
                                        })}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 font-mono"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Storage Bucket</label>
                                    <input
                                        type="text"
                                        value={settings.push.storageBucket}
                                        onChange={(e) => setSettings({
                                            ...settings,
                                            push: { ...settings.push, storageBucket: e.target.value }
                                        })}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 font-mono"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Messaging Sender ID</label>
                                    <input
                                        type="text"
                                        value={settings.push.messagingSenderId}
                                        onChange={(e) => setSettings({
                                            ...settings,
                                            push: { ...settings.push, messagingSenderId: e.target.value }
                                        })}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 font-mono"
                                    />
                                </div>
                                <div className="md:col-span-2">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">App ID</label>
                                    <input
                                        type="text"
                                        value={settings.push.appId}
                                        onChange={(e) => setSettings({
                                            ...settings,
                                            push: { ...settings.push, appId: e.target.value }
                                        })}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 font-mono"
                                    />
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
