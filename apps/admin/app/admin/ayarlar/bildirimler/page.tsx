"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Bell,
  CheckCircle,
  Mail,
  MessageSquare,
  RefreshCw,
  Save,
} from "lucide-react";
import {
  getNotificationSettings,
  testEmailConnection,
  testSMSConnection,
  updateNotificationSettings,
} from "@/lib/notifications";
import type { EmailConfig, NotificationSettings, SMSConfig } from "@/types/notification";

export default function NotificationSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<"email" | "sms" | null>(null);
  const [activeTab, setActiveTab] = useState<"email" | "sms" | "push">("email");
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    void loadSettings();
  }, []);

  async function loadSettings() {
    setLoading(true);
    try {
      const data = await getNotificationSettings();
      setSettings(data);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!settings) {
      return;
    }

    setSaving(true);
    try {
      await updateNotificationSettings(settings);
    } finally {
      setSaving(false);
    }
  }

  async function handleTest(type: "email" | "sms") {
    if (!settings) {
      return;
    }

    setTesting(type);
    setTestResult(null);

    try {
      const success = type === "email"
        ? await testEmailConnection(settings.email)
        : await testSMSConnection(settings.sms);

      setTestResult({
        success,
        message: success
          ? "Baglanti testi basarili."
          : "Baglanti kurulamadı. Bilgileri kontrol edin.",
      });
    } catch {
      setTestResult({
        success: false,
        message: "Test sirasinda hata olustu.",
      });
    } finally {
      setTesting(null);
    }
  }

  if (loading || !settings) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-500">Ayarlar yukleniyor...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50/50 p-6 md:p-8 space-y-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Bildirim Ayarları</h1>
          <p className="text-sm text-gray-500 mt-1">E-posta, SMS ve push saglayici ayarlarini yonetin.</p>
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

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col md:flex-row min-h-[560px]">
        <div className="w-full md:w-64 bg-gray-50/50 border-r border-gray-100 p-4 space-y-2">
          <SidebarTab
            active={activeTab === "email"}
            icon={Mail}
            label="E-posta"
            onClick={() => setActiveTab("email")}
          />
          <SidebarTab
            active={activeTab === "sms"}
            icon={MessageSquare}
            label="SMS"
            onClick={() => setActiveTab("sms")}
          />
          <SidebarTab
            active={activeTab === "push"}
            icon={Bell}
            label="Push"
            onClick={() => setActiveTab("push")}
          />
        </div>

        <div className="flex-1 p-6 md:p-8">
          {activeTab === "email" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-bold text-gray-900 mb-1">E-posta Ayarları</h2>
                <p className="text-sm text-gray-500">
                  Resend veya farkli bir saglayici ile store bazli gonderici ayarlarini tanimlayin.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Saglayici</label>
                  <select
                    value={settings.email.provider}
                    onChange={(event) =>
                      setSettings({
                        ...settings,
                        email: {
                          ...settings.email,
                          provider: event.target.value as EmailConfig["provider"],
                        },
                      })}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:bg-white transition-all"
                  >
                    <option value="resend">Resend API</option>
                    <option value="smtp">Ozel SMTP Sunucusu</option>
                    <option value="aws-ses">Amazon SES</option>
                  </select>
                </div>

                {settings.email.provider === "smtp" && (
                  <>
                    <TextField
                      label="SMTP Sunucusu"
                      value={settings.email.host || ""}
                      onChange={(value) =>
                        setSettings({
                          ...settings,
                          email: { ...settings.email, host: value },
                        })}
                      placeholder="smtp.example.com"
                    />
                    <TextField
                      label="Port"
                      type="number"
                      value={String(settings.email.port || "")}
                      onChange={(value) =>
                        setSettings({
                          ...settings,
                          email: {
                            ...settings.email,
                            port: value ? Number(value) : undefined,
                          },
                        })}
                      placeholder="587"
                    />
                    <TextField
                      label="Kullanici Adi"
                      value={settings.email.user || ""}
                      onChange={(value) =>
                        setSettings({
                          ...settings,
                          email: { ...settings.email, user: value },
                        })}
                    />
                    <TextField
                      label="Şifre"
                      type="password"
                      value={settings.email.password || ""}
                      onChange={(value) =>
                        setSettings({
                          ...settings,
                          email: { ...settings.email, password: value },
                        })}
                    />
                  </>
                )}

                {settings.email.provider !== "smtp" && (
                  <div className="md:col-span-2">
                    <TextField
                      label="API Anahtari"
                      type="password"
                      value={settings.email.apiKey || ""}
                      onChange={(value) =>
                        setSettings({
                          ...settings,
                          email: { ...settings.email, apiKey: value },
                        })}
                      placeholder={settings.email.provider === "resend" ? "re_..." : "API anahtarinizi girin"}
                    />
                  </div>
                )}

                <TextField
                  label="Gonderen Adi"
                  value={settings.email.senderName}
                  onChange={(value) =>
                    setSettings({
                      ...settings,
                      email: { ...settings.email, senderName: value },
                    })}
                />
                <TextField
                  label="Gonderen E-posta"
                  type="email"
                  value={settings.email.senderEmail}
                  onChange={(value) =>
                    setSettings({
                      ...settings,
                      email: { ...settings.email, senderEmail: value },
                    })}
                />
                <div className="md:col-span-2">
                  <TextField
                    label="Reply-To"
                    type="email"
                    value={settings.email.replyTo || ""}
                    onChange={(value) =>
                      setSettings({
                        ...settings,
                        email: { ...settings.email, replyTo: value },
                      })}
                    placeholder="destek@alanadiniz.com"
                  />
                </div>
              </div>

              <div className="pt-6 border-t border-gray-100">
                <button
                  onClick={() => void handleTest("email")}
                  disabled={testing === "email"}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 rounded-lg text-sm font-medium hover:bg-blue-100 transition-all disabled:opacity-50"
                >
                  {testing === "email" ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4" />
                  )}
                  Baglantiyi Test Et
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

          {activeTab === "sms" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-bold text-gray-900 mb-1">SMS Ayarları</h2>
                <p className="text-sm text-gray-500">SMS saglayicisi bilgilerini store bazli saklayin.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Saglayici</label>
                  <select
                    value={settings.sms.provider}
                    onChange={(event) =>
                      setSettings({
                        ...settings,
                        sms: {
                          ...settings.sms,
                          provider: event.target.value as SMSConfig["provider"],
                        },
                      })}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:bg-white transition-all"
                  >
                    <option value="netgsm">NetGSM</option>
                    <option value="iletimerkezi">Ileti Merkezi</option>
                    <option value="twilio">Twilio</option>
                  </select>
                </div>
                <TextField
                  label="API Anahtari"
                  value={settings.sms.apiKey}
                  onChange={(value) =>
                    setSettings({
                      ...settings,
                      sms: { ...settings.sms, apiKey: value },
                    })}
                />
                <TextField
                  label="API Secret"
                  type="password"
                  value={settings.sms.apiSecret || ""}
                  onChange={(value) =>
                    setSettings({
                      ...settings,
                      sms: { ...settings.sms, apiSecret: value },
                    })}
                />
                <TextField
                  label="Baslik"
                  value={settings.sms.senderTitle}
                  onChange={(value) =>
                    setSettings({
                      ...settings,
                      sms: { ...settings.sms, senderTitle: value },
                    })}
                  placeholder="MAGAZA"
                />
              </div>

              <div className="pt-6 border-t border-gray-100">
                <button
                  onClick={() => void handleTest("sms")}
                  disabled={testing === "sms"}
                  className="flex items-center gap-2 px-4 py-2 bg-green-50 text-green-700 rounded-lg text-sm font-medium hover:bg-green-100 transition-all disabled:opacity-50"
                >
                  {testing === "sms" ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4" />
                  )}
                  SMS Testi
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

          {activeTab === "push" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-bold text-gray-900 mb-1">Push Ayarları</h2>
                <p className="text-sm text-gray-500">Firebase veya benzeri push servis bilgilerini store bazli tutun.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <TextField
                    label="API Key"
                    value={settings.push.apiKey}
                    onChange={(value) =>
                      setSettings({
                        ...settings,
                        push: { ...settings.push, apiKey: value },
                      })}
                  />
                </div>
                <TextField
                  label="Auth Domain"
                  value={settings.push.authDomain}
                  onChange={(value) =>
                    setSettings({
                      ...settings,
                      push: { ...settings.push, authDomain: value },
                    })}
                />
                <TextField
                  label="Project ID"
                  value={settings.push.projectId}
                  onChange={(value) =>
                    setSettings({
                      ...settings,
                      push: { ...settings.push, projectId: value },
                    })}
                />
                <TextField
                  label="Storage Bucket"
                  value={settings.push.storageBucket}
                  onChange={(value) =>
                    setSettings({
                      ...settings,
                      push: { ...settings.push, storageBucket: value },
                    })}
                />
                <TextField
                  label="Messaging Sender ID"
                  value={settings.push.messagingSenderId}
                  onChange={(value) =>
                    setSettings({
                      ...settings,
                      push: { ...settings.push, messagingSenderId: value },
                    })}
                />
                <div className="md:col-span-2">
                  <TextField
                    label="App ID"
                    value={settings.push.appId}
                    onChange={(value) =>
                      setSettings({
                        ...settings,
                        push: { ...settings.push, appId: value },
                      })}
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

function SidebarTab({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: typeof Mail;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
        active
          ? "bg-white text-blue-600 shadow-sm ring-1 ring-gray-200"
          : "text-gray-600 hover:bg-white/50 hover:text-gray-900"
      }`}
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  );
}

function TextField({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 transition-all"
      />
    </div>
  );
}
