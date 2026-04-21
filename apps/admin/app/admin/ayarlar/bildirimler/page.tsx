"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Bell,
  BellOff,
  CheckCircle,
  Loader2,
  Mail,
  MessageSquare,
  RefreshCw,
  Save,
  ShieldAlert,
  Smartphone,
} from "lucide-react";
import { toast } from "sonner";
import { AdminPageHeader, AdminPageShell } from "@/components/admin/AdminPageShell";
import { AdminSectionCard } from "@/components/admin/AdminSectionCard";
import { AdminStatCard, AdminStatGrid } from "@/components/admin/AdminStatGrid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { NotificationSettings } from "@/types/notification";
import {
  deletePushSubscription,
  getNotificationCenterStatus,
  savePushSubscription,
  sendTestNotification,
  syncNotificationCenter,
  testEmailConnection,
  testSMSConnection,
  updateNotificationSettings,
} from "@/lib/notifications";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = `${base64String}${padding}`.replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from(rawData, (char) => char.charCodeAt(0));
}

async function ensureServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }

  return navigator.serviceWorker.register("/admin-sw.js", { scope: "/" });
}

export default function NotificationSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingEmail, setTestingEmail] = useState(false);
  const [testingSms, setTestingSms] = useState(false);
  const [testingPush, setTestingPush] = useState(false);
  const [syncingDevice, setSyncingDevice] = useState(false);
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [backgroundSyncError, setBackgroundSyncError] = useState<string | null>(null);
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof window !== "undefined" && "Notification" in window ? Notification.permission : "default",
  );
  const [vapidPublicKey, setVapidPublicKey] = useState("");
  const [webPushAvailable, setWebPushAvailable] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [activeSubscriptions, setActiveSubscriptions] = useState(0);
  const [subscriptionEndpoint, setSubscriptionEndpoint] = useState<string | null>(null);

  const syncBrowserSubscription = useCallback(async () => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setSubscriptionEndpoint(null);
      return;
    }

    try {
      const registration = await ensureServiceWorker();
      const subscription = await registration?.pushManager.getSubscription();
      setSubscriptionEndpoint(subscription?.endpoint || null);
    } catch (error) {
      console.warn("Notification settings service worker sync failed:", error);
      setSubscriptionEndpoint(null);
    }
  }, []);

  const refreshState = useCallback(async () => {
    setLoading(true);
    try {
      const status = await getNotificationCenterStatus();
      setSettings(status.settings);
      setVapidPublicKey(status.vapidPublicKey);
      setWebPushAvailable(status.webPushAvailable);
      setUnreadCount(status.inbox.unreadCount);
      setActiveSubscriptions(status.subscriptions.length);
      setStatusError(null);
      void syncBrowserSubscription();
    } catch (error) {
      setStatusError(error instanceof Error ? error.message : "Bildirim durumu yuklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [syncBrowserSubscription]);

  const runBackgroundSync = useCallback(
    async (force = false) => {
      try {
        const result = await syncNotificationCenter({ force });
        setBackgroundSyncError(null);
        if (result.updated) {
          await refreshState();
        }
      } catch (error) {
        setBackgroundSyncError(
          error instanceof Error ? error.message : "Arka plan bildirim senkronu tamamlanamadi.",
        );
      }
    },
    [refreshState],
  );

  useEffect(() => {
    void refreshState();
  }, [refreshState]);

  useEffect(() => {
    if (!loading && settings) {
      void runBackgroundSync();
    }
  }, [loading, settings, runBackgroundSync]);

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      return;
    }

    const updatePermission = () => {
      setPermission(Notification.permission);
    };

    updatePermission();
    window.addEventListener("focus", updatePermission);
    return () => window.removeEventListener("focus", updatePermission);
  }, []);

  const handleSave = async () => {
    if (!settings) {
      return;
    }

    setSaving(true);
    try {
      await updateNotificationSettings(settings);
      toast.success("Bildirim ayarlari kaydedildi.");
      await refreshState();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Bildirim ayarlari kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  };

  const handleEmailTest = async () => {
    if (!settings) {
      return;
    }

    setTestingEmail(true);
    try {
      const success = await testEmailConnection(settings.email);
      toast[success ? "success" : "error"](
        success ? "E-posta baglanti testi basarili." : "E-posta baglanti testi basarisiz.",
      );
    } finally {
      setTestingEmail(false);
    }
  };

  const handleSmsTest = async () => {
    if (!settings) {
      return;
    }

    setTestingSms(true);
    try {
      const success = await testSMSConnection(settings.sms);
      toast[success ? "success" : "error"](
        success ? "SMS testi basarili." : "SMS testi basarisiz.",
      );
    } finally {
      setTestingSms(false);
    }
  };

  const handlePushTest = async () => {
    setTestingPush(true);
    try {
      await sendTestNotification();
      toast.success("Test bildirimi gonderildi.");
      await refreshState();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Test bildirimi gonderilemedi.");
    } finally {
      setTestingPush(false);
    }
  };

  const handleEnableDevice = async () => {
    if (!vapidPublicKey || !webPushAvailable) {
      toast.error("Web push altyapisi henuz hazir degil.");
      return;
    }

    setSyncingDevice(true);
    try {
      const registration = await ensureServiceWorker();
      if (!registration) {
        throw new Error("Service worker desteklenmiyor.");
      }

      let nextPermission = permission;
      if (nextPermission !== "granted") {
        nextPermission = await Notification.requestPermission();
        setPermission(nextPermission);
      }

      if (nextPermission !== "granted") {
        throw new Error("Tarayici bildirim izni gerekli.");
      }

      const existingSubscription = await registration.pushManager.getSubscription();
      const subscription =
        existingSubscription ||
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
        }));

      const json = subscription.toJSON();
      const p256dh = json.keys?.p256dh;
      const auth = json.keys?.auth;

      if (!subscription.endpoint || !p256dh || !auth) {
        throw new Error("Push aboneligi eksik veri dondurdu.");
      }

      await savePushSubscription({
        endpoint: subscription.endpoint,
        p256dh,
        auth,
        userAgent: navigator.userAgent,
        platform: navigator.platform,
      });

      setSubscriptionEndpoint(subscription.endpoint);
      toast.success("Bu cihaz push bildirimlerine baglandi.");
      await refreshState();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Cihaz push bildirimine baglanamadi.");
    } finally {
      setSyncingDevice(false);
    }
  };

  const handleDisableDevice = async () => {
    setSyncingDevice(true);
    try {
      const registration = await ensureServiceWorker();
      const subscription = await registration?.pushManager.getSubscription();
      const endpoint = subscription?.endpoint || subscriptionEndpoint;

      if (endpoint) {
        await deletePushSubscription(endpoint);
      }

      await subscription?.unsubscribe();
      setSubscriptionEndpoint(null);
      toast.success("Bu cihaz icin push kapatildi.");
      await refreshState();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Cihaz bildirimi kaldirilamadi.");
    } finally {
      setSyncingDevice(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex items-center gap-3 rounded-2xl border border-[#FE6100]/10 bg-white px-4 py-3 text-sm text-gray-500 shadow-sm">
          <Loader2 className="h-4 w-4 animate-spin text-[#FE6100]" />
          Bildirim ayarlari yukleniyor...
        </div>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="w-full max-w-md rounded-[28px] border border-rose-200 bg-white p-6 text-center shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-600">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <h2 className="mt-4 text-lg font-semibold text-gray-950">Bildirim ayarlari acilamadi</h2>
          <p className="mt-2 text-sm text-gray-500">
            {statusError || "Bildirim durumu yuklenirken beklenmeyen bir hata olustu."}
          </p>
          <div className="mt-5 flex justify-center">
            <Button onClick={() => void refreshState()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Tekrar dene
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <AdminPageShell>
      <AdminPageHeader
        badge="Bildirimler"
        title="PWA bildirim merkezi"
        description="Inbox, web push ve cihaz izinlerini tek yerden yonetin."
        actions={
          <Button onClick={() => void handleSave()} loading={saving}>
            <Save className="mr-2 h-4 w-4" />
            Kaydet
          </Button>
        }
        metrics={
          <>
            <AdminStatCard label="Inbox okunmamis" value={String(unreadCount)} tone="accent" />
            <AdminStatCard label="Aktif cihaz" value={String(activeSubscriptions)} />
            <AdminStatCard
              label="Tarayici izni"
              value={
                permission === "granted"
                  ? "Acik"
                  : permission === "denied"
                    ? "Kapali"
                    : "Bekliyor"
              }
            />
            <AdminStatCard label="Dagitim" value={webPushAvailable ? "Push hazir" : "Inbox only"} />
          </>
        }
      />

      <AdminSectionCard
        header={
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold tracking-[-0.03em] text-gray-950">Cihaz ve push durumu</h2>
              <p className="mt-1 text-sm text-gray-500">Bu cihazi push akışına dahil edin veya ayırın.</p>
            </div>
          </div>
        }
      >
        <AdminStatGrid className="xl:grid-cols-3">
          <AdminStatCard label="Tarayici izni" value={permission === "granted" ? "Verildi" : permission === "denied" ? "Reddedildi" : "Bekliyor"} tone="accent" />
          <AdminStatCard label="Bu cihaz" value={subscriptionEndpoint ? "Bagli" : "Bagli degil"} />
          <AdminStatCard label="Runtime" value={webPushAvailable ? "VAPID hazir" : "Eksik"} />
        </AdminStatGrid>

        <div className="mt-4 flex flex-wrap gap-2">
          {subscriptionEndpoint ? (
            <Button variant="outline" onClick={() => void handleDisableDevice()} loading={syncingDevice}>
              <BellOff className="mr-2 h-4 w-4" />
              Bu cihazda kapat
            </Button>
          ) : (
            <Button onClick={() => void handleEnableDevice()} loading={syncingDevice}>
              <Smartphone className="mr-2 h-4 w-4" />
              Bu cihazi bagla
            </Button>
          )}

          <Button variant="secondary" onClick={() => void handlePushTest()} loading={testingPush}>
            <Bell className="mr-2 h-4 w-4" />
            Test bildirimi
          </Button>
        </div>

        {permission === "denied" ? (
          <div className="mt-4 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            Tarayici bildirim izni kapali. Push almak icin izin ayarini yeniden acmaniz gerekir.
          </div>
        ) : null}

        {backgroundSyncError ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <div className="flex items-start gap-3">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span>Yorum bildirim senkronu tamamlanamadi: {backgroundSyncError}</span>
            </div>
            <Button
              variant="outline"
              className="border-amber-300 bg-white text-amber-900 hover:bg-amber-100"
              onClick={() => void runBackgroundSync(true)}
            >
              Tekrar dene
            </Button>
          </div>
        ) : null}
      </AdminSectionCard>

      <AdminSectionCard
        header={
          <div>
            <h2 className="text-lg font-semibold tracking-[-0.03em] text-gray-950">Event matrix</h2>
            <p className="mt-1 text-sm text-gray-500">Inbox ve push için aktif olay tiplerini belirleyin.</p>
          </div>
        }
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <ToggleCard
            title="Bildirim sistemi"
            description="Store seviyesinde event uretimini acar veya durdurur."
            checked={settings.push.enabled}
            onChange={(checked) =>
              setSettings({
                ...settings,
                push: { ...settings.push, enabled: checked },
              })
            }
          />
          <ToggleCard
            title="Web push"
            description="Push uygun cihazlara servis worker uzerinden gider."
            checked={settings.push.webPushEnabled}
            onChange={(checked) =>
              setSettings({
                ...settings,
                push: { ...settings.push, webPushEnabled: checked },
              })
            }
          />
          <ToggleCard
            title="Inbox"
            description="Push kapali olsa bile admin bildirim kutusu kayit olusturur."
            checked={settings.push.inboxEnabled}
            onChange={(checked) =>
              setSettings({
                ...settings,
                push: { ...settings.push, inboxEnabled: checked },
              })
            }
          />
          <ToggleCard
            title="Yeni siparis"
            description="Yeni order olustugunda inbox ve push uretir."
            checked={settings.push.events.new_order}
            onChange={(checked) =>
              setSettings({
                ...settings,
                push: {
                  ...settings.push,
                  events: { ...settings.push.events, new_order: checked },
                },
              })
            }
          />
          <ToggleCard
            title="Yeni urun yorumu"
            description="Yeni review kaydi inbox akisina dusurulur."
            checked={settings.push.events.new_product_review}
            onChange={(checked) =>
              setSettings({
                ...settings,
                push: {
                  ...settings.push,
                  events: { ...settings.push.events, new_product_review: checked },
                },
              })
            }
          />
          <ToggleCard
            title="Ödeme hatası"
            description="Başarısız ödeme durumları için operatör uyarısı üretir."
            checked={settings.push.events.payment_failed}
            onChange={(checked) =>
              setSettings({
                ...settings,
                push: {
                  ...settings.push,
                  events: { ...settings.push.events, payment_failed: checked },
                },
              })
            }
          />
        </div>
      </AdminSectionCard>

      <AdminSectionCard
        header={
          <div>
            <h2 className="text-lg font-semibold tracking-[-0.03em] text-gray-950">E-posta ve SMS</h2>
            <p className="mt-1 text-sm text-gray-500">Operasyonel iletim ayarlari ayni ekranda tutulur.</p>
          </div>
        }
      >
        <div className="grid gap-6 xl:grid-cols-2">
          <div className="space-y-4 rounded-[22px] border border-[#FE6100]/10 bg-[#fff8f3] p-4">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-[#FE6100]" />
              <h3 className="text-base font-semibold text-gray-950">E-posta</h3>
            </div>
            <div className="grid gap-4">
              <Input
                label="Gonderen adi"
                value={settings.email.senderName}
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    email: { ...settings.email, senderName: event.target.value },
                  })
                }
              />
              <Input
                label="Gonderen e-posta"
                type="email"
                value={settings.email.senderEmail}
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    email: { ...settings.email, senderEmail: event.target.value },
                  })
                }
              />
              <Input
                label="API anahtari"
                type="password"
                value={settings.email.apiKey || ""}
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    email: { ...settings.email, apiKey: event.target.value },
                  })
                }
              />
            </div>
            <Button variant="secondary" onClick={() => void handleEmailTest()} loading={testingEmail}>
              <RefreshCw className="mr-2 h-4 w-4" />
              E-posta testi
            </Button>
          </div>

          <div className="space-y-4 rounded-[22px] border border-[#FE6100]/10 bg-white p-4">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-[#FE6100]" />
              <h3 className="text-base font-semibold text-gray-950">SMS</h3>
            </div>
            <div className="grid gap-4">
              <Input
                label="Saglayici anahtari"
                value={settings.sms.apiKey}
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    sms: { ...settings.sms, apiKey: event.target.value },
                  })
                }
              />
              <Input
                label="API secret"
                type="password"
                value={settings.sms.apiSecret || ""}
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    sms: { ...settings.sms, apiSecret: event.target.value },
                  })
                }
              />
              <Input
                label="Gonderici basligi"
                value={settings.sms.senderTitle}
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    sms: { ...settings.sms, senderTitle: event.target.value },
                  })
                }
              />
            </div>
            <Button variant="secondary" onClick={() => void handleSmsTest()} loading={testingSms}>
              <RefreshCw className="mr-2 h-4 w-4" />
              SMS testi
            </Button>
          </div>
        </div>
      </AdminSectionCard>
    </AdminPageShell>
  );
}

function ToggleCard({
  title,
  description,
  checked,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-[22px] border border-[#FE6100]/10 bg-white p-4 shadow-sm transition-all hover:border-[#FE6100]/20">
      <input
        type="checkbox"
        className="mt-1 h-4 w-4 rounded border-[#d8c3b1] text-[#FE6100] focus:ring-[#FE6100]"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <div>
        <p className="text-sm font-semibold text-gray-950">{title}</p>
        <p className="mt-1 text-sm text-gray-500">{description}</p>
        <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-[#fff6f1] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#FE6100]">
          {checked ? <CheckCircle className="h-3.5 w-3.5" /> : <BellOff className="h-3.5 w-3.5" />}
          {checked ? "Acik" : "Kapali"}
        </div>
      </div>
    </label>
  );
}
