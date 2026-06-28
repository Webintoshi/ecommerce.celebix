"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Copy, Filter, Mail, RefreshCw, Save, Send } from "lucide-react";
import { AdminEmptyState, AdminPageHeader, AdminPageShell } from "@/components/admin/AdminPageShell";
import { RichTextEditor } from "@/components/admin/RichTextEditor";
import { STORE_RUNTIME } from "@/lib/store-runtime";
import { buildEmailTemplateVariables, renderEmailTemplate } from "@/lib/email-marketing";
import type { EmailConfig } from "@/types/notification";
import type { EmailMarketingRecipient, EmailMarketingSettings, EmailMarketingTemplateId } from "@/types/email-marketing";

type LoadPayload = {
  emailSettings: EmailConfig;
  marketingSettings: EmailMarketingSettings;
};

type RecipientResponse = {
  recipients: EmailMarketingRecipient[];
};

type FilterKey = "all" | "optin" | "vip" | "new";

type EmailMetric = {
  label: string;
  value: string;
  detail: string;
  icon: typeof Mail;
  tone?: "accent" | "success" | "warning" | "neutral";
};

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
        throw new Error(settingsPayload.error || "E-posta ayarları yüklenemedi.");
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
        text: error instanceof Error ? error.message : "Sayfa yüklenemedi.",
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
  const approvedRecipientCount = useMemo(
    () => recipients.filter((recipient) => recipient.acceptsEmailMarketing).length,
    [recipients],
  );
  const emailMetrics = useMemo<EmailMetric[]>(
    () => [
      {
        label: "Şablon",
        value: (marketingSettings?.templates.length || 0).toLocaleString("tr-TR"),
        detail: "hazır",
        icon: Mail,
        tone: "accent",
      },
      {
        label: "Alıcı",
        value: recipients.length.toLocaleString("tr-TR"),
        detail: `${approvedRecipientCount.toLocaleString("tr-TR")} onaylı`,
        icon: CheckCircle2,
        tone: "success",
      },
      {
        label: "Seçili",
        value: selectedCount.toLocaleString("tr-TR"),
        detail: "gönderim",
        icon: Send,
        tone: selectedCount > 0 ? "accent" : "neutral",
      },
      {
        label: "Durum",
        value: emailSettings?.apiKey ? "Hazır" : "Eksik",
        detail: "Resend",
        icon: RefreshCw,
        tone: emailSettings?.apiKey ? "success" : "warning",
      },
    ],
    [approvedRecipientCount, emailSettings?.apiKey, marketingSettings?.templates.length, recipients.length, selectedCount],
  );

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
        throw new Error(payload.error || "Resend ayarları kaydedilemedi.");
      }

      setEmailSettings(payload.emailSettings);
      setStatusMessage({ type: "success", text: "E-posta gönderici ayarları kaydedildi." });
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
        throw new Error(payload.error || "Şablon ayarları kaydedilemedi.");
      }

      setMarketingSettings(payload.marketingSettings);
      setStatusMessage({ type: "success", text: "E-posta şablonları kaydedildi." });
    } catch (error) {
      setStatusMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Şablonlar kaydedilemedi.",
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
        throw new Error(payload.error || "Test e-postası gönderilemedi.");
      }

      setStatusMessage({ type: "success", text: payload.message || "Test e-postası gönderildi." });
    } catch (error) {
      setStatusMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Test e-postası başarısız.",
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
        throw new Error(payload.error || "Kampanya gönderimi başarısız.");
      }

      setStatusMessage({
        type: "success",
        text: `${payload.delivered || 0} alıcıya kampanya gönderildi.`,
      });
      setSelectedRecipients([]);
    } catch (error) {
      setStatusMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Kampanya gönderilemedi.",
      });
    } finally {
      setSending(false);
    }
  }

  if (loading || !emailSettings || !marketingSettings || !activeTemplate) {
    return (
      <main className="min-h-screen bg-[#F9F9F9] pb-8 text-[#111827]">
        <div className="mx-auto flex min-h-[520px] w-full max-w-none items-center justify-center px-4 sm:px-5 xl:px-6">
          <div className="flex min-w-[260px] flex-col items-center gap-4 border-y border-[#DCE3EC] bg-white px-8 py-10 text-center sm:rounded-[12px] sm:border">
            <div className="h-9 w-9 animate-spin rounded-full border-2 border-[#FF6A00] border-t-transparent" />
            <p className="text-sm font-semibold text-[#6B7280]">E-posta merkezi yükleniyor</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#F9F9F9] pb-8 text-[#111827]">
      <div className="mx-auto w-full max-w-none space-y-4 px-4 sm:px-5 xl:px-6">
        <AdminPageShell>
          <AdminPageHeader
            sectionLabel="Pazarlama"
            title="E-posta Kampanyaları"
            description="Şablon, alıcı ve gönderici ayarlarını yönetin."
            actions={
              <button
                type="button"
                onClick={() => void loadPage()}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-[8px] border border-[#DCE3EC] bg-white px-3 text-sm font-semibold text-[#4B5563] transition hover:border-[#FFD1B5] hover:bg-[#FFF8F3] hover:text-[#E85D04] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FFF1E8]"
              >
                <RefreshCw className="h-4 w-4" />
                Yenile
              </button>
            }
            metrics={
              <>
                {emailMetrics.map((metric) => (
                  <EmailMetricCell key={metric.label} {...metric} />
                ))}
              </>
            }
          />

        {statusMessage && (
          <div
            className={`border-y px-4 py-3 text-sm font-semibold sm:rounded-[12px] sm:border ${
              statusMessage.type === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-rose-200 bg-rose-50 text-rose-700"
            }`}
          >
            {statusMessage.text}
          </div>
        )}

          <div className="grid gap-4 min-[1280px]:grid-cols-[360px_minmax(0,1fr)]">
            <aside className="space-y-4">
              <section className="overflow-hidden border-y border-[#DCE3EC] bg-white sm:rounded-[12px] sm:border">
                <div className="flex min-h-[54px] items-center justify-between gap-3 border-b border-[#E1E6EF] px-4">
                  <h2 className="text-base font-semibold text-[#111827]">Gönderici</h2>
                <a
                  href="https://resend.com/signup"
                  target="_blank"
                  rel="noreferrer"
                    className="text-xs font-semibold text-[#E85D04] transition hover:text-[#C94F00]"
                >
                  Hesap aç
                </a>
              </div>

                <div className="space-y-4 px-4 py-4">
                <LabeledInput
                  label="API anahtarı"
                  type="password"
                  value={emailSettings.apiKey || ""}
                  onChange={(value) => setEmailSettings({ ...emailSettings, provider: "resend", apiKey: value })}
                  placeholder="re_..."
                />
                <LabeledInput
                  label="Gönderen adı"
                  value={emailSettings.senderName}
                  onChange={(value) => setEmailSettings({ ...emailSettings, senderName: value })}
                  placeholder={STORE_RUNTIME.name}
                />
                <LabeledInput
                  label="Gönderen e-posta adresi"
                  type="email"
                  value={emailSettings.senderEmail}
                  onChange={(value) => setEmailSettings({ ...emailSettings, senderEmail: value })}
                  placeholder={STORE_RUNTIME.senderEmail}
                />
                <LabeledInput
                  label="Yanıt adresi"
                  type="email"
                  value={emailSettings.replyTo || ""}
                  onChange={(value) => setEmailSettings({ ...emailSettings, replyTo: value })}
                  placeholder={STORE_RUNTIME.supportEmail}
                />
              </div>

                <div className="grid grid-cols-1 gap-2 border-t border-[#E1E6EF] bg-[#F9F9F9] px-4 py-3 sm:grid-cols-2 min-[1280px]:grid-cols-1">
                <button
                  type="button"
                  onClick={() => void handleSaveSettings()}
                  disabled={savingSettings}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-[8px] bg-[#FF6A00] px-3 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(255,106,0,0.16)] transition hover:bg-[#E85D04] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.20)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {savingSettings ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Kaydet
                </button>
                <button
                  type="button"
                  onClick={() => void handleTestEmail()}
                  disabled={testing}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-[8px] border border-[#DCE3EC] bg-white px-3 text-sm font-semibold text-[#4B5563] transition hover:border-[#FFD1B5] hover:bg-[#FFF8F3] hover:text-[#E85D04] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FFF1E8] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {testing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                  Test gönder
                </button>
              </div>
            </section>
          </aside>

            <section className="space-y-4">
              <section className="grid overflow-hidden border-y border-[#DCE3EC] bg-white sm:rounded-[12px] sm:border xl:grid-cols-[260px_minmax(0,1fr)]">
                <div className="border-b border-[#E1E6EF] xl:border-b-0 xl:border-r">
                  <div className="flex min-h-[54px] items-center justify-between gap-3 px-4">
                    <h2 className="text-base font-semibold text-[#111827]">Şablonlar</h2>
                    <span className="text-sm font-semibold text-[#6B7280]">
                      {marketingSettings.templates.length.toLocaleString("tr-TR")}
                    </span>
                  </div>
                  <div className="divide-y divide-[#E1E6EF]">
                    {marketingSettings.templates.map((template) => (
                      <button
                        key={template.id}
                        type="button"
                        onClick={() => setSelectedTemplateId(template.id)}
                        className={`w-full px-4 py-3 text-left transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FFF1E8] ${
                          selectedTemplateId === template.id
                              ? "bg-[#FFF1E8] text-[#E85D04]"
                              : "bg-white text-[#111827] hover:bg-[#FFF8F3]"
                        }`}
                      >
                          <div className="text-sm font-semibold">{template.name}</div>
                          <div className="mt-1 line-clamp-1 text-xs font-medium text-[#6B7280]">{template.description}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="min-w-0">
                  <div className="flex min-h-[64px] flex-col gap-3 border-b border-[#E1E6EF] px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                        <h3 className="text-base font-semibold text-[#111827]">{activeTemplate.name}</h3>
                        <p className="mt-1 line-clamp-1 text-sm font-medium text-[#6B7280]">{activeTemplate.description}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleSaveTemplates()}
                      disabled={savingTemplates}
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-[8px] bg-[#FF6A00] px-4 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(255,106,0,0.16)] transition hover:bg-[#E85D04] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.20)] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {savingTemplates ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        Şablonu Kaydet
                    </button>
                  </div>

                  <div className="space-y-4 p-4">
                    <LabeledInput
                      label="Konu"
                      value={activeTemplate.subject}
                      onChange={(value) =>
                        updateActiveTemplate((current) => ({
                          ...current,
                          subject: value,
                        }))
                      }
                      placeholder="E-posta konusu"
                    />

                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-[#374151]">İçerik</label>
                      <div className="overflow-hidden rounded-[10px] border border-[#DCE3EC] bg-white p-2">
                        <RichTextEditor
                          value={activeTemplate.bodyHtml}
                          onChange={(value) =>
                            updateActiveTemplate((current) => ({
                              ...current,
                              bodyHtml: value,
                            }))
                          }
                          placeholder="E-posta içeriğini yazın..."
                          minHeightClassName="min-h-[260px]"
                        />
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 text-xs font-semibold text-[#6B7280]">
                      {["firstName", "lastName", "email", "storeName", "storeUrl", "productsUrl"].map((variable) => (
                        <span key={variable} className="rounded-[8px] border border-[#DCE3EC] bg-[#F9F9F9] px-2.5 py-1">
                          {`{${variable}}`}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </section>

              <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
                <div className="overflow-hidden border-y border-[#DCE3EC] bg-white sm:rounded-[12px] sm:border">
                  <div className="flex flex-col gap-3 border-b border-[#E1E6EF] px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <h3 className="text-base font-semibold text-[#111827]">Alıcılar</h3>
                      <p className="mt-1 text-sm font-medium text-[#6B7280]">
                        {selectedCount.toLocaleString("tr-TR")} seçili, {filteredRecipients.length.toLocaleString("tr-TR")} görünür
                      </p>
                    </div>

                    <div className="flex flex-col gap-2 md:flex-row md:items-center">
                      <div className="relative min-w-0 md:min-w-[280px]">
                        <Filter className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8B95A5]" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                        placeholder="Müşteri veya e-posta ara"
                          className="h-10 w-full rounded-[8px] border border-[#DCE3EC] bg-white py-2 pl-11 pr-3 text-sm font-medium text-[#111827] outline-none transition placeholder:text-[#8B95A5] focus:border-[#FFD1B5] focus:ring-4 focus:ring-[#FFF1E8]"
                      />
                    </div>
                    <select
                      value={filter}
                      onChange={(event) => setFilter(event.target.value as FilterKey)}
                        className="h-10 rounded-[8px] border border-[#DCE3EC] bg-white px-3 text-sm font-semibold text-[#374151] outline-none transition focus:border-[#FFD1B5] focus:ring-4 focus:ring-[#FFF1E8]"
                    >
                      <option value="optin">Pazarlama onayı olanlar</option>
                      <option value="all">Tüm alıcılar</option>
                      <option value="vip">VIP etiketliler</option>
                      <option value="new">Son 30 gün</option>
                    </select>
                  </div>
                </div>

                  <div className="hidden lg:block">
                    <div className="max-h-[520px] overflow-y-auto">
                    <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-[#EEF3F7] text-[#4B5563]">
                        <tr>
                            <th className="w-12 px-4 py-3 text-left">
                            <input
                              type="checkbox"
                              checked={filteredRecipients.length > 0 && filteredRecipients.every((recipient) => selectedRecipients.includes(recipient.id))}
                              onChange={(event) => toggleAllVisible(event.target.checked)}
                                className="h-4 w-4 cursor-pointer rounded border-[#B8C2CC] text-[#FF6A00] focus:ring-[#FFD1B5]"
                            />
                          </th>
                            <th className="px-4 py-3 text-left text-xs font-semibold">Müşteri</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold">E-posta</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold">Durum</th>
                        </tr>
                      </thead>
                      <tbody>
                          {filteredRecipients.length === 0 ? (
                            <tr>
                              <td colSpan={4} className="px-4 py-10">
                                <AdminEmptyState
                                  title="Alıcı bulunamadı"
                                  description="Filtreyi değiştirerek müşteri listesini kontrol edin."
                                  className="border-[#DCE3EC] bg-[#F9F9F9]"
                                />
                              </td>
                            </tr>
                          ) : null}
                          {filteredRecipients.map((recipient) => {
                          const isSelected = selectedRecipients.includes(recipient.id);

                          return (
                            <tr
                              key={recipient.id}
                                className={`border-t border-[#E1E6EF] transition ${isSelected ? "bg-[#FFF8F3]" : "bg-white hover:bg-[#F9F9F9]"}`}
                            >
                                <td className="px-4 py-3 align-top">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={(event) => toggleRecipient(recipient.id, event.target.checked)}
                                    className="h-4 w-4 cursor-pointer rounded border-[#B8C2CC] text-[#FF6A00] focus:ring-[#FFD1B5]"
                                />
                              </td>
                                <td className="px-4 py-3 align-top">
                                  <div className="font-semibold text-[#111827]">
                                    {[recipient.firstName, recipient.lastName].filter(Boolean).join(" ") || "Adsız müşteri"}
                                  </div>
                                  <div className="mt-2 flex flex-wrap gap-1.5">
                                    {recipient.tags.map((tag) => (
                                      <span
                                        key={tag}
                                          className="inline-flex rounded-[7px] border border-[#DCE3EC] bg-[#F9F9F9] px-2 py-0.5 text-[11px] font-medium text-[#6B7280]"
                                      >
                                        {tag}
                                      </span>
                                    ))}
                                  </div>
                              </td>
                                <td className="px-4 py-3 align-top text-[#4B5563]">{recipient.email}</td>
                                <td className="px-4 py-3 align-top">
                                {recipient.acceptsEmailMarketing ? (
                                    <span className="text-sm font-semibold text-emerald-600">
                                    Onaylı
                                  </span>
                                ) : (
                                    <span className="text-sm font-semibold text-[#C94F00]">
                                    Manuel açık
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                  <div className="space-y-0 divide-y divide-[#E1E6EF] lg:hidden">
                    {filteredRecipients.length === 0 ? (
                      <div className="p-4">
                        <AdminEmptyState
                          title="Alıcı bulunamadı"
                          description="Filtreyi değiştirerek müşteri listesini kontrol edin."
                          className="border-[#DCE3EC] bg-[#F9F9F9]"
                        />
                      </div>
                    ) : null}
                    {filteredRecipients.map((recipient) => {
                    const isSelected = selectedRecipients.includes(recipient.id);

                    return (
                      <article
                        key={recipient.id}
                          className={`p-4 transition ${isSelected ? "bg-[#FFF8F3]" : "bg-white"}`}
                      >
                        <div className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(event) => toggleRecipient(recipient.id, event.target.checked)}
                              className="mt-1 h-4 w-4 rounded border-[#B8C2CC] text-[#FF6A00] focus:ring-[#FFD1B5]"
                          />
                            <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                  <div className="font-semibold text-[#111827]">
                                  {[recipient.firstName, recipient.lastName].filter(Boolean).join(" ") || "Adsız müşteri"}
                                </div>
                                  <div className="mt-1 break-all text-sm text-[#4B5563]">{recipient.email}</div>
                              </div>
                              <span
                                  className={`text-xs font-semibold ${
                                    recipient.acceptsEmailMarketing ? "text-emerald-600" : "text-[#C94F00]"
                                }`}
                              >
                                {recipient.acceptsEmailMarketing ? "Onaylı" : "Manuel açık"}
                              </span>
                            </div>

                            {recipient.tags.length > 0 && (
                                <div className="mt-3 flex flex-wrap gap-1.5">
                                {recipient.tags.map((tag) => (
                                  <span
                                    key={tag}
                                      className="inline-flex rounded-[7px] border border-[#DCE3EC] bg-[#F9F9F9] px-2 py-0.5 text-[11px] font-medium text-[#6B7280]"
                                  >
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>

                <aside className="overflow-hidden border-y border-[#DCE3EC] bg-white sm:rounded-[12px] sm:border">
                  <div className="flex min-h-[54px] items-center justify-between gap-3 border-b border-[#E1E6EF] px-4">
                  <div>
                      <h3 className="text-base font-semibold text-[#111827]">Önizleme</h3>
                      <p className="mt-1 line-clamp-1 text-xs font-medium text-[#6B7280]">
                      {previewRecipient ? `${previewRecipient.firstName || previewRecipient.email} için hazırlanıyor.` : "Seçili alıcı yok."}
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
                      className="inline-flex h-10 items-center gap-2 rounded-[8px] border border-[#DCE3EC] bg-white px-3 text-sm font-semibold text-[#4B5563] transition hover:border-[#FFD1B5] hover:bg-[#FFF8F3] hover:text-[#E85D04] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FFF1E8]"
                  >
                    <Copy className="h-4 w-4" />
                      Kopyala
                  </button>
                </div>

                  <div className="p-4">
                    <div className="overflow-hidden rounded-[10px] border border-[#DCE3EC] bg-white">
                      <div className="border-b border-[#E1E6EF] bg-[#F9F9F9] px-4 py-3">
                        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#6B7280]">Konu</div>
                        <div className="mt-1 line-clamp-2 text-sm font-semibold text-[#111827]">{previewContent?.subject || activeTemplate.subject}</div>
                      </div>
                      <div className="max-h-[420px] overflow-y-auto px-4 py-4">
                        <div
                            className="prose prose-sm max-w-none text-[#374151] prose-a:text-[#E85D04] prose-headings:text-[#111827]"
                          dangerouslySetInnerHTML={{ __html: previewContent?.html || activeTemplate.bodyHtml }}
                        />
                      </div>
                    </div>

                <button
                  type="button"
                  onClick={() => void handleSendCampaign()}
                  disabled={sending || selectedRecipients.length === 0 || !emailSettings.apiKey}
                    className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-[8px] bg-[#FF6A00] px-4 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(255,106,0,0.16)] transition hover:bg-[#E85D04] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.20)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {sending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Kampanyayı gönder
                </button>

                    <div className="mt-3 border-t border-[#E1E6EF] pt-3 text-sm leading-6 text-[#6B7280]">
                      <div className="font-semibold text-[#111827]">Gönderim özeti</div>
                      <div>{selectedRecipients.length.toLocaleString("tr-TR")} alıcı seçili.</div>
                      <div>{buildEmailTemplateVariables(previewRecipient).storeName} gönderen kimliği kullanılacak.</div>
                      {!emailSettings.apiKey && <div className="mt-1 font-semibold text-[#C94F00]">Resend API anahtarı girilmeden gönderim başlamaz.</div>}
                    </div>
                </div>
              </aside>
            </section>
          </section>
        </div>
        </AdminPageShell>
      </div>
    </main>
  );
}

function EmailMetricCell({ label, value, detail, icon: Icon, tone = "neutral" }: EmailMetric) {
  return (
    <div className="min-h-[92px] bg-white px-4 py-3.5 xl:px-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#6B7280]">{label}</p>
        <Icon
          className={`h-4 w-4 ${
            tone === "success"
              ? "text-emerald-500"
              : tone === "warning"
                ? "text-[#C94F00]"
                : tone === "accent"
                  ? "text-[#FF6A00]"
                  : "text-[#9CA3AF]"
          }`}
        />
      </div>
      <div className="mt-3 flex items-end gap-2">
        <p className="truncate text-3xl font-semibold leading-none tracking-[-0.04em] text-[#111827]">{value}</p>
        <span className="pb-1 text-sm font-medium text-[#6B7280]">{detail}</span>
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
    <div className="space-y-2">
      <label className="text-sm font-semibold text-[#374151]">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-10 w-full rounded-[8px] border border-[#DCE3EC] bg-white px-3 text-sm font-medium text-[#111827] outline-none transition placeholder:text-[#8B95A5] focus:border-[#FFD1B5] focus:ring-4 focus:ring-[#FFF1E8]"
      />
    </div>
  );
}
