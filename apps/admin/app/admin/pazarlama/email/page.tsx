"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  Copy,
  Eye,
  Filter,
  Mail,
  RefreshCw,
  Save,
  Send,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { STORE_RUNTIME } from "@/lib/store-runtime";
import { RichTextEditor } from "@/components/admin/RichTextEditor";
import { buildEmailTemplateVariables, renderEmailTemplate } from "@/lib/email-marketing";
import type { EmailMarketingRecipient, EmailMarketingSettings, EmailMarketingTemplateId } from "@/types/email-marketing";
import type { EmailConfig } from "@/types/notification";

type LoadPayload = {
  emailSettings: EmailConfig;
  marketingSettings: EmailMarketingSettings;
};

type RecipientResponse = {
  recipients: EmailMarketingRecipient[];
};

type FilterKey = "all" | "optin" | "vip" | "new";

export default function EmailMarketingPage() {
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingTemplates, setSavingTemplates] = useState(false);
  const [testing, setTesting] = useState(false);
  const [sending, setSending] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<FilterKey>("optin");
  const [selectedTemplateId, setSelectedTemplateId] = useState<EmailMarketingTemplateId>("welcome");
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>([]);
  const [emailSettings, setEmailSettings] = useState<EmailConfig | null>(null);
  const [marketingSettings, setMarketingSettings] = useState<EmailMarketingSettings | null>(null);
  const [recipients, setRecipients] = useState<EmailMarketingRecipient[]>([]);
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    void loadPage();
  }, []);

  async function loadPage() {
    setLoading(true);
    setStatusMessage(null);

    try {
      const [settingsResponse, recipientsResponse] = await Promise.all([
        fetch("/api/admin/marketing/email/settings", { cache: "no-store" }),
        fetch("/api/admin/marketing/email/recipients", { cache: "no-store" }),
      ]);

      const settingsPayload = (await settingsResponse.json()) as LoadPayload & { success?: boolean; error?: string };
      const recipientsPayload = (await recipientsResponse.json()) as RecipientResponse & { success?: boolean; error?: string };

      if (!settingsResponse.ok || settingsPayload.success === false) {
        throw new Error(settingsPayload.error || "E-posta ayarlari yuklenemedi.");
      }

      if (!recipientsResponse.ok || recipientsPayload.success === false) {
        throw new Error(recipientsPayload.error || "Müşteri listesi yüklenemedi.");
      }

      setEmailSettings(settingsPayload.emailSettings);
      setMarketingSettings(settingsPayload.marketingSettings);
      setRecipients(recipientsPayload.recipients || []);
    } catch (error) {
      setStatusMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Sayfa yuklenemedi.",
      });
    } finally {
      setLoading(false);
    }
  }

  const activeTemplate = useMemo(() => {
    if (!marketingSettings) {
      return null;
    }

    return marketingSettings.templates.find((template) => template.id === selectedTemplateId) || null;
  }, [marketingSettings, selectedTemplateId]);

  const filteredRecipients = useMemo(() => {
    const now = Date.now();
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;

    return recipients.filter((recipient) => {
      const query = searchQuery.trim().toLocaleLowerCase("tr");
      const matchesQuery =
        !query ||
        recipient.email.toLocaleLowerCase("tr").includes(query) ||
        recipient.firstName.toLocaleLowerCase("tr").includes(query) ||
        recipient.lastName.toLocaleLowerCase("tr").includes(query);

      const matchesFilter =
        filter === "all" ||
        (filter === "optin" && recipient.acceptsEmailMarketing) ||
        (filter === "vip" && recipient.tags.some((tag) => tag.toLocaleLowerCase("tr").includes("vip"))) ||
        (filter === "new" && now - new Date(recipient.createdAt).getTime() <= thirtyDays);

      return matchesQuery && matchesFilter;
    });
  }, [filter, recipients, searchQuery]);

  const previewRecipient = useMemo(() => {
    return recipients.find((recipient) => recipient.id === selectedRecipients[0]) || recipients[0] || undefined;
  }, [recipients, selectedRecipients]);

  const previewContent = useMemo(() => {
    if (!activeTemplate) {
      return null;
    }

    return renderEmailTemplate(activeTemplate, previewRecipient);
  }, [activeTemplate, previewRecipient]);

  const selectedCount = selectedRecipients.length;

  function updateActiveTemplate(updater: (current: NonNullable<typeof activeTemplate>) => NonNullable<typeof activeTemplate>) {
    if (!activeTemplate || !marketingSettings) {
      return;
    }

    setMarketingSettings({
      templates: marketingSettings.templates.map((template) =>
        template.id === activeTemplate.id
          ? {
              ...updater(activeTemplate),
              updatedAt: new Date().toISOString(),
            }
          : template,
      ),
    });
  }

  function toggleRecipient(id: string, checked: boolean) {
    setSelectedRecipients((current) =>
      checked ? Array.from(new Set([...current, id])) : current.filter((item) => item !== id),
    );
  }

  function toggleAllVisible(checked: boolean) {
    setSelectedRecipients((current) => {
      const visibleIds = filteredRecipients.map((recipient) => recipient.id);
      if (!checked) {
        return current.filter((id) => !visibleIds.includes(id));
      }

      return Array.from(new Set([...current, ...visibleIds]));
    });
  }

  async function handleSaveSettings() {
    if (!emailSettings) {
      return;
    }

    setSavingSettings(true);
    setStatusMessage(null);

    try {
      const response = await fetch("/api/admin/marketing/email/settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ emailSettings }),
      });
      const payload = await response.json();

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Resend ayarlari kaydedilemedi.");
      }

      setEmailSettings(payload.emailSettings);
      setStatusMessage({ type: "success", text: "E-posta gonderici ayarlari kaydedildi." });
    } catch (error) {
      setStatusMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Ayarlar kaydedilemedi.",
      });
    } finally {
      setSavingSettings(false);
    }
  }

  async function handleSaveTemplates() {
    if (!marketingSettings) {
      return;
    }

    setSavingTemplates(true);
    setStatusMessage(null);

    try {
      const response = await fetch("/api/admin/marketing/email/settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ marketingSettings }),
      });
      const payload = await response.json();

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Template ayarlari kaydedilemedi.");
      }

      setMarketingSettings(payload.marketingSettings);
      setStatusMessage({ type: "success", text: "E-posta template'leri kaydedildi." });
    } catch (error) {
      setStatusMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Template'ler kaydedilemedi.",
      });
    } finally {
      setSavingTemplates(false);
    }
  }

  async function handleTestEmail() {
    if (!emailSettings) {
      return;
    }

    setTesting(true);
    setStatusMessage(null);

    try {
      const response = await fetch("/api/admin/marketing/email/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          config: emailSettings,
          testEmail: emailSettings.senderEmail,
        }),
      });
      const payload = await response.json();

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Test e-postasi gonderilemedi.");
      }

      setStatusMessage({ type: "success", text: payload.message || "Test e-postasi gonderildi." });
    } catch (error) {
      setStatusMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Test e-postasi basarisiz.",
      });
    } finally {
      setTesting(false);
    }
  }

  async function handleSendCampaign() {
    if (!activeTemplate || selectedRecipients.length === 0) {
      return;
    }

    setSending(true);
    setStatusMessage(null);

    try {
      const response = await fetch("/api/admin/marketing/email/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          customerIds: selectedRecipients,
          subject: activeTemplate.subject,
          bodyHtml: activeTemplate.bodyHtml,
        }),
      });

      const payload = await response.json();

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Kampanya gonderimi basarisiz.");
      }

      setStatusMessage({
        type: "success",
        text: `${payload.delivered || 0} aliciya kampanya gonderildi.`,
      });
      setSelectedRecipients([]);
    } catch (error) {
      setStatusMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Kampanya gonderilemedi.",
      });
    } finally {
      setSending(false);
    }
  }

  if (loading || !emailSettings || !marketingSettings || !activeTemplate) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-500">E-posta merkezi yukleniyor...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F9FA] p-6 md:p-8 space-y-8">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-bold text-blue-600 uppercase tracking-widest">
            <Sparkles className="w-3.5 h-3.5" />
            Resend E-posta Merkezi
          </div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">E-posta Kampanyalari</h1>
          <p className="text-sm text-gray-500 max-w-2xl">
            Magaza bazli Resend ayarlarini kaydedin, standart template'leri duzenleyin ve musterilerinize ayni ekrandan gonderim yapin.
          </p>
        </div>

        <div className="flex gap-3">
          <Link
            href="/admin/pazarlama"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl text-sm font-semibold hover:bg-gray-50 transition-all"
          >
            <X className="w-4 h-4" />
            Geri
          </Link>
          <button
            type="button"
            onClick={() => void loadPage()}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl text-sm font-semibold hover:bg-gray-50 transition-all"
          >
            <RefreshCw className="w-4 h-4" />
            Yenile
          </button>
        </div>
      </div>

      {statusMessage && (
        <div className={`rounded-2xl px-4 py-3 text-sm border ${
          statusMessage.type === "success"
            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
            : "bg-rose-50 text-rose-700 border-rose-200"
        }`}>
          {statusMessage.text}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[420px_minmax(0,1fr)] gap-6">
        <section className="bg-white rounded-3xl border border-gray-200 shadow-sm p-6 space-y-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Resend Baglantisi</h2>
              <p className="text-sm text-gray-500">Musteriniz Resend hesabini acip anahtarini buraya girecek.</p>
            </div>
            <a
              href="https://resend.com/signup"
              target="_blank"
              rel="noreferrer"
              className="text-sm font-semibold text-blue-600 hover:text-blue-700"
            >
              Hesap Ac
            </a>
          </div>

          <div className="space-y-4">
            <LabeledInput
              label="API Anahtari"
              type="password"
              value={emailSettings.apiKey || ""}
              onChange={(value) => setEmailSettings({ ...emailSettings, provider: "resend", apiKey: value })}
              placeholder="re_..."
            />
            <LabeledInput
              label="Gonderen Adi"
              value={emailSettings.senderName}
              onChange={(value) => setEmailSettings({ ...emailSettings, senderName: value })}
              placeholder={STORE_RUNTIME.name}
            />
            <LabeledInput
              label="Gonderen E-posta"
              type="email"
              value={emailSettings.senderEmail}
              onChange={(value) => setEmailSettings({ ...emailSettings, senderEmail: value })}
              placeholder={STORE_RUNTIME.senderEmail}
            />
            <LabeledInput
              label="Reply-To"
              type="email"
              value={emailSettings.replyTo || ""}
              onChange={(value) => setEmailSettings({ ...emailSettings, replyTo: value })}
              placeholder={STORE_RUNTIME.supportEmail}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => void handleSaveSettings()}
              disabled={savingSettings}
              className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 transition-all disabled:opacity-50"
            >
              {savingSettings ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Ayarları Kaydet
            </button>
            <button
              type="button"
              onClick={() => void handleTestEmail()}
              disabled={testing}
              className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-blue-50 text-blue-700 text-sm font-semibold hover:bg-blue-100 transition-all disabled:opacity-50"
            >
              {testing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
              Test Gonder
            </button>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4 space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              Standart Template'ler
            </div>
            <ul className="text-sm text-gray-600 space-y-1">
              <li>Hos Geldiniz</li>
              <li>Ozel Teklif</li>
              <li>Yeni Ürün</li>
              <li>Sipariş Hatırlatma</li>
            </ul>
          </div>
        </section>

        <section className="bg-white rounded-3xl border border-gray-200 shadow-sm p-6 space-y-6">
          <div className="flex flex-col lg:flex-row gap-6">
            <div className="lg:w-72 space-y-3">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Template'ler</h2>
                <p className="text-sm text-gray-500">Standart kampanya e-postalarini store bazli duzenleyin.</p>
              </div>

              <div className="space-y-2">
                {marketingSettings.templates.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => setSelectedTemplateId(template.id)}
                    className={`w-full rounded-2xl border px-4 py-3 text-left transition-all ${
                      selectedTemplateId === template.id
                        ? "border-gray-900 bg-gray-900 text-white"
                        : "border-gray-200 bg-white hover:border-gray-300"
                    }`}
                  >
                    <div className="font-semibold">{template.name}</div>
                    <div className={`text-xs mt-1 ${
                      selectedTemplateId === template.id ? "text-gray-300" : "text-gray-500"
                    }`}>
                      {template.description}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-bold text-gray-900">{activeTemplate.name}</h3>
                  <p className="text-sm text-gray-500">{activeTemplate.description}</p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleSaveTemplates()}
                  disabled={savingTemplates}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 transition-all disabled:opacity-50"
                >
                  {savingTemplates ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Template'leri Kaydet
                </button>
              </div>

              <LabeledInput
                label="Konu"
                value={activeTemplate.subject}
                onChange={(value) =>
                  updateActiveTemplate((current) => ({
                    ...current,
                    subject: value,
                  }))}
                placeholder="E-posta konusu"
              />

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">İçerik</label>
                <RichTextEditor
                  value={activeTemplate.bodyHtml}
                  onChange={(value) =>
                    updateActiveTemplate((current) => ({
                      ...current,
                      bodyHtml: value,
                    }))}
                  placeholder="E-posta icerigini yazin..."
                  minHeightClassName="min-h-[260px]"
                />
              </div>

              <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
                Kullanabileceginiz degiskenler: <span className="font-semibold">{`{firstName}`}</span>, <span className="font-semibold">{`{lastName}`}</span>, <span className="font-semibold">{`{email}`}</span>, <span className="font-semibold">{`{storeName}`}</span>, <span className="font-semibold">{`{storeUrl}`}</span>, <span className="font-semibold">{`{productsUrl}`}</span>
              </div>
            </div>
          </div>

          <div className="border-t border-gray-100 pt-6 grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-6">
            <div className="space-y-4">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-bold text-gray-900">Alicilar</h3>
                  <p className="text-sm text-gray-500">{selectedCount} secili / {filteredRecipients.length} gorunur musteri</p>
                </div>
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="relative">
                    <Filter className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      placeholder="Müşteri ara"
                      className="pl-9 pr-3 py-2 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                    />
                  </div>
                  <select
                    value={filter}
                    onChange={(event) => setFilter(event.target.value as FilterKey)}
                    className="px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  >
                    <option value="optin">Pazarlama onayi olanlar</option>
                    <option value="all">Tum alicilar</option>
                    <option value="vip">VIP etiketli</option>
                    <option value="new">Son 30 gun</option>
                  </select>
                </div>
              </div>

              <div className="rounded-2xl border border-gray-200 overflow-hidden">
                <div className="max-h-[420px] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-3 text-left">
                          <input
                            type="checkbox"
                            checked={filteredRecipients.length > 0 && filteredRecipients.every((recipient) => selectedRecipients.includes(recipient.id))}
                            onChange={(event) => toggleAllVisible(event.target.checked)}
                            className="w-4 h-4 rounded border-gray-300"
                          />
                        </th>
                        <th className="px-4 py-3 text-left font-semibold text-gray-600">Müşteri</th>
                        <th className="px-4 py-3 text-left font-semibold text-gray-600">E-posta</th>
                        <th className="px-4 py-3 text-left font-semibold text-gray-600">Durum</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRecipients.map((recipient) => (
                        <tr key={recipient.id} className="border-b border-gray-100 last:border-0">
                          <td className="px-4 py-3 align-top">
                            <input
                              type="checkbox"
                              checked={selectedRecipients.includes(recipient.id)}
                              onChange={(event) => toggleRecipient(recipient.id, event.target.checked)}
                              className="w-4 h-4 rounded border-gray-300"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-medium text-gray-900">
                              {[recipient.firstName, recipient.lastName].filter(Boolean).join(" ") || "Adsiz musteri"}
                            </div>
                            {recipient.tags.length > 0 && (
                              <div className="text-xs text-gray-500 mt-1">{recipient.tags.join(", ")}</div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-gray-600">{recipient.email}</td>
                          <td className="px-4 py-3">
                            {recipient.acceptsEmailMarketing ? (
                              <span className="inline-flex px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold">
                                Opt-in
                              </span>
                            ) : (
                              <span className="inline-flex px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 text-xs font-semibold">
                                Manuele acik
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-3xl border border-gray-200 bg-gray-50 p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-bold text-gray-900">Onizleme</h3>
                    <p className="text-sm text-gray-500">
                      {previewRecipient
                        ? `${previewRecipient.firstName || previewRecipient.email} icin`
                        : "Secili alici yok"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (!previewContent?.html) {
                        return;
                      }

                      void navigator.clipboard.writeText(previewContent.html);
                    }}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-100 transition-all"
                  >
                    <Copy className="w-4 h-4" />
                    HTML
                  </button>
                </div>

                <div className="rounded-2xl border border-gray-200 bg-white p-4 space-y-3">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-widest text-gray-400">Konu</div>
                    <div className="text-sm font-semibold text-gray-900 mt-1">{previewContent?.subject || activeTemplate.subject}</div>
                  </div>
                  <div className="border-t border-gray-100 pt-3">
                    <div className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">İçerik</div>
                    <div
                      className="prose prose-sm max-w-none prose-a:text-blue-600"
                      dangerouslySetInnerHTML={{ __html: previewContent?.html || activeTemplate.bodyHtml }}
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => void handleSendCampaign()}
                  disabled={sending || selectedRecipients.length === 0 || !emailSettings.apiKey}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 transition-all disabled:opacity-50"
                >
                  {sending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Kampanyayi Gonder
                </button>

                <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-600">
                  <div className="font-semibold text-gray-900 mb-1">Gonderim ozet</div>
                  <div>{selectedRecipients.length} alici secili</div>
                  <div>{buildEmailTemplateVariables(previewRecipient).storeName} gonderen kimligi kullanilacak</div>
                  {!emailSettings.apiKey && (
                    <div className="mt-2 text-rose-600 font-medium">Resend API anahtari girilmeden gonderim baslamaz.</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function LabeledInput({
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
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-gray-700">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
      />
    </div>
  );
}
