"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Copy, Filter, Mail, RefreshCw, Save, Send, X } from "lucide-react";
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
      <div className="flex min-h-screen items-center justify-center bg-[var(--admin-bg)] px-4">
        <div className="flex flex-col items-center gap-4 rounded-[28px] border border-[var(--admin-border)] bg-white/90 px-8 py-10 shadow-[var(--shadow-md)] backdrop-blur">
          <div className="h-9 w-9 animate-spin rounded-full border-2 border-[#c08a43] border-t-transparent" />
          <p className="text-sm text-[#7e6954]">E-posta merkezi yükleniyor...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-page-root px-4 py-4 md:px-6 md:py-6 xl:px-8">
      <div className="mx-auto max-w-[1680px] space-y-6">
        <header className="rounded-[32px] border border-[var(--admin-border)] bg-white/88 p-5 shadow-[var(--shadow-md)] backdrop-blur md:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-3">
              <span className="inline-flex w-fit items-center rounded-full border border-[var(--admin-border)] bg-[var(--admin-accent-soft)] px-3.5 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--admin-accent-hover)]">
                E-posta Pazarlama
              </span>
              <div className="space-y-2">
                <h1 className="text-3xl font-semibold tracking-[-0.03em] text-[#352312] md:text-[2.5rem]">
                  E-posta Kampanyaları
                </h1>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                href="/admin/pazarlama"
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[var(--admin-border)] bg-white px-4 py-3 text-sm font-semibold text-[var(--admin-text-secondary)] transition hover:border-[#d7c0a4] hover:bg-[var(--admin-accent-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(255,106,0,0.18)] focus-visible:ring-offset-2 focus-visible:ring-offset-white"
              >
                <X className="h-4 w-4" />
                Geri
              </Link>
              <button
                type="button"
                onClick={() => void loadPage()}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[var(--admin-accent-border)] bg-[var(--admin-accent)] px-4 py-3 text-sm font-semibold text-white shadow-[0_16px_32px_-22px_rgba(166,106,45,0.8)] transition hover:bg-[var(--admin-accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(255,106,0,0.18)] focus-visible:ring-offset-2 focus-visible:ring-offset-white"
              >
                <RefreshCw className="h-4 w-4" />
                Yenile
              </button>
            </div>
          </div>
        </header>

        {statusMessage && (
          <div
            className={`rounded-[24px] border px-4 py-3 text-sm shadow-sm ${
              statusMessage.type === "success"
                ? "border-[#c7e6ce] bg-[#edf9f0] text-[#256c3f]"
                : "border-[#f0c7c3] bg-[#fff1ef] text-[#a1453f]"
            }`}
          >
            {statusMessage.text}
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 2xl:grid-cols-[390px_minmax(0,1fr)]">
          <aside className="space-y-6">
            <section className="rounded-[30px] border border-[var(--admin-border)] bg-white/92 p-5 shadow-[var(--shadow-md)] backdrop-blur md:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <span className="inline-flex rounded-full border border-[var(--admin-border)] bg-[var(--admin-accent-soft)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--admin-accent-hover)]">
                    Gönderici bağlantısı
                  </span>
                  <h2 className="mt-3 text-lg font-semibold text-[#3f2a17]">Resend ayarları</h2>
                </div>
                <a
                  href="https://resend.com/signup"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex rounded-full border border-[var(--admin-border)] bg-[var(--admin-accent-soft)] px-3 py-1.5 text-xs font-semibold text-[var(--admin-accent-hover)] transition hover:bg-[var(--admin-accent-soft)]"
                >
                  Hesap aç
                </a>
              </div>

              <div className="mt-5 space-y-4">
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

              <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => void handleSaveSettings()}
                  disabled={savingSettings}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[var(--admin-accent-border)] bg-[var(--admin-accent)] px-4 py-3 font-semibold text-white shadow-[0_18px_36px_-24px_rgba(166,106,45,0.75)] transition hover:bg-[var(--admin-accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(255,106,0,0.18)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {savingSettings ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Ayarları kaydet
                </button>
                <button
                  type="button"
                  onClick={() => void handleTestEmail()}
                  disabled={testing}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[var(--admin-border)] bg-[var(--admin-accent-soft)] px-4 py-3 font-semibold text-[var(--admin-accent-hover)] transition hover:bg-[var(--admin-accent-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(255,106,0,0.18)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {testing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                  Test gönder
                </button>
              </div>

              <div className="mt-5 rounded-[26px] border border-[var(--admin-border)] bg-[#FCFDFE] p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#3f2a17]">
                  <CheckCircle2 className="h-4 w-4 text-[#2f8f59]" />
                  Hazır şablon seti
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {marketingSettings.templates.map((template) => (
                    <span
                      key={template.id}
                      className="inline-flex rounded-full border border-[var(--admin-border)] bg-[#fff8eb] px-3 py-1.5 text-xs font-medium text-[var(--admin-text-secondary)]"
                    >
                      {template.name}
                    </span>
                  ))}
                </div>
              </div>
            </section>
          </aside>

          <section className="space-y-6">
            <section className="rounded-[30px] border border-[var(--admin-border)] bg-white/92 p-5 shadow-[var(--shadow-md)] backdrop-blur md:p-6">
              <div className="grid grid-cols-1 gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
                <div className="space-y-3">
                  <div>
                    <span className="inline-flex rounded-full border border-[var(--admin-border)] bg-[var(--admin-accent-soft)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--admin-accent-hover)]">
                      Şablon listesi
                    </span>
                    <h2 className="mt-3 text-lg font-semibold text-[#3f2a17]">Kampanya akışları</h2>
                  </div>

                  <div className="space-y-2">
                    {marketingSettings.templates.map((template) => (
                      <button
                        key={template.id}
                        type="button"
                        onClick={() => setSelectedTemplateId(template.id)}
                        className={`w-full rounded-[24px] border px-4 py-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(255,106,0,0.18)] focus-visible:ring-offset-2 ${
                          selectedTemplateId === template.id
                            ? "border-[#d5ad74] bg-[var(--admin-accent-soft)] shadow-[0_18px_38px_-28px_rgba(166,106,45,0.65)]"
                            : "border-[var(--admin-border)] bg-[#FCFDFE] hover:border-[var(--admin-accent-border)] hover:bg-[var(--admin-accent-soft)]"
                        }`}
                      >
                        <div className="font-semibold text-[#342313]">{template.name}</div>
                        <div className="mt-1 text-sm leading-6 text-[var(--admin-text-secondary)]">{template.description}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <h3 className="text-xl font-semibold text-[#322113]">{activeTemplate.name}</h3>
                      <p className="mt-1 text-sm leading-6 text-[#7c6855]">{activeTemplate.description}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleSaveTemplates()}
                      disabled={savingTemplates}
                      className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[var(--admin-accent-border)] bg-[var(--admin-accent)] px-4 py-3 font-semibold text-white shadow-[0_18px_36px_-24px_rgba(166,106,45,0.75)] transition hover:bg-[var(--admin-accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(255,106,0,0.18)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {savingTemplates ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      Şablonları kaydet
                    </button>
                  </div>

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
                    <label className="text-sm font-semibold text-[#5c4330]">İçerik</label>
                    <div className="overflow-hidden rounded-[28px] border border-[var(--admin-border)] bg-[#FCFDFE] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)]">
                      <RichTextEditor
                        value={activeTemplate.bodyHtml}
                        onChange={(value) =>
                          updateActiveTemplate((current) => ({
                            ...current,
                            bodyHtml: value,
                          }))
                        }
                        placeholder="E-posta içeriğini yazın..."
                        minHeightClassName="min-h-[300px]"
                      />
                    </div>
                  </div>

                  <div className="rounded-[24px] border border-[var(--admin-border)] bg-[#FCFDFE] px-4 py-3 text-sm leading-6 text-[var(--admin-text-secondary)]">
                    Kullanabileceğiniz değişkenler: <span className="font-semibold text-[#5d4123]">{`{firstName}`}</span>, <span className="font-semibold text-[#5d4123]">{`{lastName}`}</span>, <span className="font-semibold text-[#5d4123]">{`{email}`}</span>, <span className="font-semibold text-[#5d4123]">{`{storeName}`}</span>, <span className="font-semibold text-[#5d4123]">{`{storeUrl}`}</span>, <span className="font-semibold text-[#5d4123]">{`{productsUrl}`}</span>
                  </div>
                </div>
              </div>
            </section>

            <section className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.1fr)_380px]">
              <div className="rounded-[30px] border border-[var(--admin-border)] bg-white/92 p-5 shadow-[var(--shadow-md)] backdrop-blur md:p-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <span className="inline-flex rounded-full border border-[var(--admin-border)] bg-[var(--admin-accent-soft)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--admin-accent-hover)]">
                      Alıcı seçimi
                    </span>
                    <h3 className="mt-3 text-lg font-semibold text-[#3f2a17]">Gönderim listesi</h3>
                    <p className="mt-1 text-sm text-[#826c57]">{selectedCount} seçili alıcı, {filteredRecipients.length} görünür kayıt.</p>
                  </div>

                  <div className="flex flex-col gap-3 md:flex-row md:items-center">
                    <div className="relative min-w-0 md:min-w-[260px]">
                      <Filter className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#b2916f]" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                        placeholder="Müşteri veya e-posta ara"
                        className="w-full rounded-2xl border border-[var(--admin-border)] bg-[#FCFDFE] py-3 pl-11 pr-4 text-sm text-[var(--admin-heading)] placeholder:text-[var(--admin-text-muted)] transition focus:border-[var(--admin-accent-border)] focus:bg-white focus:outline-none focus:ring-4 focus:ring-[rgba(255,106,0,0.14)]"
                      />
                    </div>
                    <select
                      value={filter}
                      onChange={(event) => setFilter(event.target.value as FilterKey)}
                      className="rounded-2xl border border-[var(--admin-border)] bg-[#FCFDFE] px-4 py-3 text-sm text-[var(--admin-heading)] transition focus:border-[var(--admin-accent-border)] focus:bg-white focus:outline-none focus:ring-4 focus:ring-[rgba(255,106,0,0.14)]"
                    >
                      <option value="optin">Pazarlama onayı olanlar</option>
                      <option value="all">Tüm alıcılar</option>
                      <option value="vip">VIP etiketliler</option>
                      <option value="new">Son 30 gün</option>
                    </select>
                  </div>
                </div>

                <div className="mt-5 hidden overflow-hidden rounded-[28px] border border-[var(--admin-border)] lg:block">
                  <div className="max-h-[560px] overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-[#FCFDFE] text-[var(--admin-text-secondary)]">
                        <tr>
                          <th className="px-5 py-4 text-left">
                            <input
                              type="checkbox"
                              checked={filteredRecipients.length > 0 && filteredRecipients.every((recipient) => selectedRecipients.includes(recipient.id))}
                              onChange={(event) => toggleAllVisible(event.target.checked)}
                              className="h-4 w-4 cursor-pointer rounded border-[#ceb292] text-[#a66a2d] focus:ring-[#c58a38]"
                            />
                          </th>
                          <th className="px-5 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.2em]">Müşteri</th>
                          <th className="px-5 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.2em]">E-posta</th>
                          <th className="px-5 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.2em]">Durum</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredRecipients.map((recipient) => {
                          const isSelected = selectedRecipients.includes(recipient.id);

                          return (
                            <tr
                              key={recipient.id}
                              className={`border-t border-[#f4e8d7] transition ${isSelected ? "bg-[#fff4df]" : "bg-white hover:bg-[#FCFDFE]"}`}
                            >
                              <td className="px-5 py-4 align-top">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={(event) => toggleRecipient(recipient.id, event.target.checked)}
                                  className="h-4 w-4 cursor-pointer rounded border-[#ceb292] text-[#a66a2d] focus:ring-[#c58a38]"
                                />
                              </td>
                              <td className="px-5 py-4 align-top">
                                <div className="space-y-1">
                                  <div className="font-semibold text-[#322113]">
                                    {[recipient.firstName, recipient.lastName].filter(Boolean).join(" ") || "Adsız müşteri"}
                                  </div>
                                  <div className="flex flex-wrap gap-2">
                                    {recipient.tags.map((tag) => (
                                      <span
                                        key={tag}
                                        className="inline-flex rounded-full border border-[var(--admin-border)] bg-[#fff8eb] px-2.5 py-1 text-[11px] font-medium text-[var(--admin-text-secondary)]"
                                      >
                                        {tag}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              </td>
                              <td className="px-5 py-4 align-top text-[#73563a]">{recipient.email}</td>
                              <td className="px-5 py-4 align-top">
                                {recipient.acceptsEmailMarketing ? (
                                  <span className="inline-flex rounded-full bg-[#ecf8ef] px-2.5 py-1 text-xs font-semibold text-[#2d7a49]">
                                    Onaylı
                                  </span>
                                ) : (
                                  <span className="inline-flex rounded-full bg-[#f7eee7] px-2.5 py-1 text-xs font-semibold text-[#9d6e43]">
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

                <div className="mt-5 space-y-3 lg:hidden">
                  {filteredRecipients.map((recipient) => {
                    const isSelected = selectedRecipients.includes(recipient.id);

                    return (
                      <article
                        key={recipient.id}
                        className={`rounded-[26px] border p-4 transition ${
                          isSelected ? "border-[#dba85f] bg-[#fff4df]" : "border-[#eee2d1] bg-white"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(event) => toggleRecipient(recipient.id, event.target.checked)}
                            className="mt-1 h-4 w-4 rounded border-[#ceb292] text-[#a66a2d] focus:ring-[#c58a38]"
                          />
                          <div className="min-w-0 flex-1 space-y-3">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <div className="font-semibold text-[#322113]">
                                  {[recipient.firstName, recipient.lastName].filter(Boolean).join(" ") || "Adsız müşteri"}
                                </div>
                                <div className="mt-1 break-all text-sm text-[#7a6654]">{recipient.email}</div>
                              </div>
                              <span
                                className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                                  recipient.acceptsEmailMarketing ? "bg-[#ecf8ef] text-[#2d7a49]" : "bg-[#f7eee7] text-[#9d6e43]"
                                }`}
                              >
                                {recipient.acceptsEmailMarketing ? "Onaylı" : "Manuel açık"}
                              </span>
                            </div>

                            {recipient.tags.length > 0 && (
                              <div className="flex flex-wrap gap-2">
                                {recipient.tags.map((tag) => (
                                  <span
                                    key={tag}
                                    className="inline-flex rounded-full border border-[var(--admin-border)] bg-[#fff8eb] px-2.5 py-1 text-[11px] font-medium text-[var(--admin-text-secondary)]"
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

              <aside className="rounded-[30px] border border-[var(--admin-border)] bg-white/92 p-5 shadow-[var(--shadow-md)] backdrop-blur md:p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <span className="inline-flex rounded-full border border-[var(--admin-border)] bg-[var(--admin-accent-soft)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--admin-accent-hover)]">
                      Önizleme ve gönderim
                    </span>
                    <h3 className="mt-3 text-lg font-semibold text-[#3f2a17]">E-posta yüzeyi</h3>
                    <p className="mt-1 text-sm text-[#826c57]">
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
                    className="inline-flex items-center gap-2 rounded-2xl border border-[var(--admin-border)] bg-[#faf4eb] px-4 py-2.5 text-sm font-semibold text-[var(--admin-text-secondary)] transition hover:bg-[#f3ebdf] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(255,106,0,0.18)] focus-visible:ring-offset-2"
                  >
                    <Copy className="h-4 w-4" />
                    HTML kopyala
                  </button>
                </div>

                <div className="mt-5 rounded-[28px] border border-[#e2dccf] bg-[linear-gradient(180deg,_#efe6d9_0%,_#f8f4ec_22%,_#ffffff_22%,_#ffffff_100%)] p-4">
                  <div className="rounded-[24px] bg-white p-4 shadow-[0_16px_32px_-28px_rgba(75,50,24,0.55)]">
                    <div className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#8f7a63]">
                      <div className="h-2 w-2 rounded-full bg-[#d0b291]" />
                      E-posta önizleme
                    </div>
                    <div className="space-y-4">
                      <div className="rounded-[20px] border border-[var(--admin-border)] bg-[#FCFDFE] px-4 py-3">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#aa8a68]">Konu</div>
                        <div className="mt-1 text-sm font-semibold text-[#322113]">{previewContent?.subject || activeTemplate.subject}</div>
                      </div>
                      <div className="rounded-[20px] border border-[var(--admin-border)] bg-white px-4 py-4">
                        <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#aa8a68]">İçerik</div>
                        <div
                          className="prose prose-sm max-w-none text-[#4b392a] prose-a:text-[#9a632a] prose-headings:text-[#2f2012]"
                          dangerouslySetInnerHTML={{ __html: previewContent?.html || activeTemplate.bodyHtml }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => void handleSendCampaign()}
                  disabled={sending || selectedRecipients.length === 0 || !emailSettings.apiKey}
                  className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-[var(--admin-accent-border)] bg-[var(--admin-accent)] px-4 py-3.5 font-semibold text-white shadow-[0_18px_36px_-24px_rgba(166,106,45,0.75)] transition hover:bg-[var(--admin-accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(255,106,0,0.18)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {sending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Kampanyayı gönder
                </button>

                <div className="mt-4 rounded-[24px] border border-[var(--admin-border)] bg-[#FCFDFE] px-4 py-4 text-sm leading-6 text-[var(--admin-text-secondary)]">
                  <div className="font-semibold text-[#3f2a17]">Gönderim özeti</div>
                  <div className="mt-2">{selectedRecipients.length} alıcı seçili.</div>
                  <div>{buildEmailTemplateVariables(previewRecipient).storeName} gönderen kimliği kullanılacak.</div>
                  {!emailSettings.apiKey && <div className="mt-2 font-medium text-[#a1453f]">Resend API anahtarı girilmeden gönderim başlamaz.</div>}
                </div>
              </aside>
            </section>
          </section>
        </div>
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
      <label className="text-sm font-semibold text-[#5c4330]">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-2xl border border-[var(--admin-border)] bg-[#FCFDFE] px-4 py-3 text-sm text-[var(--admin-heading)] placeholder:text-[var(--admin-text-muted)] transition focus:border-[var(--admin-accent-border)] focus:bg-white focus:outline-none focus:ring-4 focus:ring-[rgba(255,106,0,0.14)]"
      />
    </div>
  );
}
