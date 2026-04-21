"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bell,
  BellOff,
  CheckCheck,
  ExternalLink,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Smartphone,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import type { AdminInboxNotificationRecord } from "@/types/notification";
import {
  deletePushSubscription,
  getNotificationCenterStatus,
  markAllNotificationsRead,
  markNotificationRead,
  savePushSubscription,
  sendTestNotification,
} from "@/lib/notifications";

type NotificationCenterStatus = Awaited<ReturnType<typeof getNotificationCenterStatus>>;

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = `${base64String}${padding}`.replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from(rawData, (char) => char.charCodeAt(0));
}

function relativeTime(value: string) {
  const date = new Date(value);
  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.max(1, Math.round(diffMs / 60000));

  if (diffMinutes < 60) {
    return `${diffMinutes} dk once`;
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours} sa once`;
  }

  const diffDays = Math.round(diffHours / 24);
  return `${diffDays} gun once`;
}

function getNotificationTypeLabel(type: AdminInboxNotificationRecord["type"]) {
  switch (type) {
    case "new_order":
      return "Yeni siparis";
    case "new_product_review":
      return "Yeni yorum";
    case "payment_failed":
      return "Ödeme hatası";
    default:
      return "Bildirim";
  }
}

async function ensureServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }

  const registration = await navigator.serviceWorker.register("/admin-sw.js", {
    scope: "/",
  });

  return registration;
}

export function AdminNotificationCenter({
  isMobile,
}: {
  isMobile: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncingPush, setSyncingPush] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [status, setStatus] = useState<NotificationCenterStatus | null>(null);
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof window !== "undefined" && "Notification" in window ? Notification.permission : "default",
  );
  const [subscriptionEndpoint, setSubscriptionEndpoint] = useState<string | null>(null);

  const applyAppBadge = useCallback(async (unreadCount: number) => {
    if (typeof window === "undefined") {
      return;
    }

    const badgeNavigator = navigator as Navigator & {
      setAppBadge?: (count?: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };

    try {
      if (unreadCount > 0 && badgeNavigator.setAppBadge) {
        await badgeNavigator.setAppBadge(unreadCount);
        return;
      }

      if (unreadCount === 0 && badgeNavigator.clearAppBadge) {
        await badgeNavigator.clearAppBadge();
      }
    } catch {
      // Ignore unsupported badge errors.
    }
  }, []);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      const nextStatus = await getNotificationCenterStatus();
      setStatus(nextStatus);
      await applyAppBadge(nextStatus.inbox.unreadCount);
    } catch (error) {
      console.error("Notification center load failed:", error);
      toast.error(error instanceof Error ? error.message : "Bildirim merkezi yuklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [applyAppBadge]);

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
      console.warn("Browser push subscription sync failed:", error);
      setSubscriptionEndpoint(null);
    }
  }, []);

  useEffect(() => {
    void ensureServiceWorker();
    void loadStatus();
    void syncBrowserSubscription();
  }, [loadStatus, syncBrowserSubscription]);

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      return;
    }

    const handleVisibilityChange = () => {
      setPermission(Notification.permission);
      if (!document.hidden) {
        void loadStatus();
        void syncBrowserSubscription();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [loadStatus, syncBrowserSubscription]);

  const unreadCount = status?.inbox.unreadCount || 0;
  const inboxItems = status?.inbox.items || [];
  const webPushAvailable = Boolean(status?.webPushAvailable && status?.vapidPublicKey);
  const pushEnabled = Boolean(status?.settings.push.enabled && status?.settings.push.webPushEnabled);
  const inboxEnabled = Boolean(status?.settings.push.inboxEnabled);
  const hasActiveSubscription = Boolean(subscriptionEndpoint);

  const permissionLabel = useMemo(() => {
    if (permission === "granted") {
      return "Izin verildi";
    }
    if (permission === "denied") {
      return "Izin kapali";
    }
    return "Izin bekleniyor";
  }, [permission]);

  const handleEnablePush = useCallback(async () => {
    if (!webPushAvailable || !status?.vapidPublicKey) {
      toast.error("Web push icin VAPID anahtarlari hazir degil.");
      return;
    }

    setSyncingPush(true);

    try {
      const registration = await ensureServiceWorker();
      if (!registration) {
        throw new Error("Service worker kaydi desteklenmiyor.");
      }

      let nextPermission = permission;
      if ("Notification" in window && permission !== "granted") {
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
          applicationServerKey: urlBase64ToUint8Array(status.vapidPublicKey),
        }));

      const json = subscription.toJSON();
      const p256dh = json.keys?.p256dh;
      const auth = json.keys?.auth;

      if (!subscription.endpoint || !p256dh || !auth) {
        throw new Error("Push aboneligi eksik anahtar dondurdu.");
      }

      await savePushSubscription({
        endpoint: subscription.endpoint,
        p256dh,
        auth,
        userAgent: navigator.userAgent,
        platform: navigator.platform,
      });

      setSubscriptionEndpoint(subscription.endpoint);
      toast.success("Push bildirimleri bu cihaza baglandi.");
      await loadStatus();
    } catch (error) {
      console.error("Enable push failed:", error);
      toast.error(error instanceof Error ? error.message : "Push aboneligi kurulamadi.");
    } finally {
      setSyncingPush(false);
    }
  }, [loadStatus, permission, status?.vapidPublicKey, webPushAvailable]);

  const handleDisablePush = useCallback(async () => {
    setSyncingPush(true);
    try {
      const registration = await ensureServiceWorker();
      const subscription = await registration?.pushManager.getSubscription();
      const endpoint = subscription?.endpoint || subscriptionEndpoint;

      if (endpoint) {
        await deletePushSubscription(endpoint);
      }

      await subscription?.unsubscribe();
      setSubscriptionEndpoint(null);
      toast.success("Push bildirimi bu cihaz icin kapatildi.");
      await loadStatus();
    } catch (error) {
      console.error("Disable push failed:", error);
      toast.error(error instanceof Error ? error.message : "Push aboneligi kaldirilamadi.");
    } finally {
      setSyncingPush(false);
    }
  }, [loadStatus, subscriptionEndpoint]);

  const handleMarkAllRead = useCallback(async () => {
    try {
      await markAllNotificationsRead();
      setStatus((current) =>
        current
          ? {
              ...current,
              inbox: {
                unreadCount: 0,
                items: current.inbox.items.map((item) => ({
                  ...item,
                  readAt: item.readAt || new Date().toISOString(),
                })),
              },
            }
          : current,
      );
      await applyAppBadge(0);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Bildirimler guncellenemedi.");
    }
  }, [applyAppBadge]);

  const handleMarkRead = useCallback(
    async (notificationId: string) => {
      try {
        await markNotificationRead(notificationId);
        setStatus((current) => {
          if (!current) {
            return current;
          }

          const nextItems = current.inbox.items.map((item) =>
            item.id === notificationId && !item.readAt
              ? { ...item, readAt: new Date().toISOString() }
              : item,
          );
          const nextUnreadCount = nextItems.filter((item) => !item.readAt).length;
          void applyAppBadge(nextUnreadCount);

          return {
            ...current,
            inbox: {
              unreadCount: nextUnreadCount,
              items: nextItems,
            },
          };
        });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Bildirim okunamadi.");
      }
    },
    [applyAppBadge],
  );

  const handleSendTest = useCallback(async () => {
    setSendingTest(true);
    try {
      await sendTestNotification();
      toast.success("Test bildirimi siraya alindi.");
      await loadStatus();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Test bildirimi gonderilemedi.");
    } finally {
      setSendingTest(false);
    }
  }, [loadStatus]);

  const shellClassName = isMobile
    ? "fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] z-[72] mx-3 rounded-[24px] border border-[#FE6100]/12 bg-white/95 shadow-[0_24px_60px_rgba(15,23,42,0.22)] backdrop-blur-xl"
    : "absolute right-0 top-[calc(100%+0.75rem)] z-[72] w-[min(26rem,calc(100vw-2rem))] rounded-[26px] border border-[#FE6100]/12 bg-white/96 shadow-[0_24px_60px_rgba(15,23,42,0.18)] backdrop-blur-xl";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[#FE6100]/12 bg-white text-gray-700 shadow-sm transition-all hover:border-[#FE6100]/24 hover:text-[#FE6100] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FE6100]/15"
        aria-label="Bildirim merkezi"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#FE6100] px-1 text-[10px] font-bold text-white shadow-lg">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <>
          <button
            type="button"
            aria-label="Bildirim merkezini kapat"
            className="fixed inset-0 z-[70] bg-black/30 backdrop-blur-[1px]"
            onClick={() => setOpen(false)}
          />

          <section className={shellClassName}>
            <header className="flex items-start justify-between gap-4 border-b border-[#FE6100]/10 px-4 py-4 md:px-5">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-[#FE6100]/10 bg-[#fff6f1] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#FE6100]">
                  Bildirimler
                </div>
                <h3 className="mt-3 text-lg font-semibold tracking-[-0.03em] text-gray-950">
                  Operasyon merkezi
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  {unreadCount > 0
                    ? `${unreadCount} okunmamis kayit var.`
                    : "Tum bildirimler goruldu."}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[#FE6100]/10 bg-white text-gray-500 transition-all hover:text-[#FE6100] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FE6100]/15"
                aria-label="Kapat"
              >
                <BellOff className="h-4 w-4" />
              </button>
            </header>

            <div className="max-h-[min(70dvh,38rem)] overflow-y-auto px-4 py-4 md:px-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-[22px] border border-[#FE6100]/10 bg-[#fff8f3] p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#FE6100]">
                    Cihaz durumu
                  </p>
                  <p className="mt-2 text-base font-semibold text-gray-950">
                    {hasActiveSubscription ? "Push bagli" : "Push bagli degil"}
                  </p>
                  <p className="mt-1 text-sm text-gray-500">
                    {permissionLabel}
                  </p>
                </div>

                <div className="rounded-[22px] border border-[#FE6100]/10 bg-white p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#FE6100]">
                    Dagitim
                  </p>
                  <p className="mt-2 text-base font-semibold text-gray-950">
                    {pushEnabled && webPushAvailable ? "Push + Inbox" : inboxEnabled ? "Yalniz inbox" : "Kapali"}
                  </p>
                  <p className="mt-1 text-sm text-gray-500">
                    Store ayarlarindaki event matrix kullaniliyor.
                  </p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {pushEnabled && webPushAvailable ? (
                  hasActiveSubscription ? (
                    <button
                      type="button"
                      onClick={() => void handleDisablePush()}
                      disabled={syncingPush}
                      className="inline-flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-700 transition-all hover:bg-rose-100 disabled:opacity-60"
                    >
                      {syncingPush ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellOff className="h-4 w-4" />}
                      Bu cihazda kapat
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void handleEnablePush()}
                      disabled={syncingPush}
                      className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-[#FE6100] to-[#E85A00] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_16px_30px_rgba(254,97,0,0.24)] transition-all hover:from-[#E85A00] hover:to-[#D45500] disabled:opacity-60"
                    >
                      {syncingPush ? <Loader2 className="h-4 w-4 animate-spin" /> : <Smartphone className="h-4 w-4" />}
                      Cihazi bagla
                    </button>
                  )
                ) : (
                  <div className="inline-flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-medium text-amber-800">
                    <ShieldAlert className="h-4 w-4" />
                    Web push runtime hazir degil
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => void handleSendTest()}
                  disabled={sendingTest}
                  className="inline-flex items-center gap-2 rounded-2xl border border-[#FE6100]/12 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-all hover:border-[#FE6100]/24 hover:text-[#FE6100] disabled:opacity-60"
                >
                  {sendingTest ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  Test gonder
                </button>

                <button
                  type="button"
                  onClick={() => void handleMarkAllRead()}
                  disabled={unreadCount === 0}
                  className="inline-flex items-center gap-2 rounded-2xl border border-[#FE6100]/12 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-all hover:border-[#FE6100]/24 hover:text-[#FE6100] disabled:opacity-60"
                >
                  <CheckCheck className="h-4 w-4" />
                  Tumunu okundu yap
                </button>
              </div>

              <div className="mt-5">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-gray-950">Bildirim kutusu</p>
                  <Link
                    href="/admin/ayarlar/bildirimler"
                    className="inline-flex items-center gap-1 text-sm font-medium text-[#FE6100] transition-colors hover:text-[#D45500]"
                    onClick={() => setOpen(false)}
                  >
                    Ayarlara git
                    <ExternalLink className="h-4 w-4" />
                  </Link>
                </div>

                {loading ? (
                  <div className="flex items-center gap-2 rounded-[22px] border border-[#FE6100]/10 bg-white px-4 py-6 text-sm text-gray-500">
                    <Loader2 className="h-4 w-4 animate-spin text-[#FE6100]" />
                    Bildirimler yukleniyor...
                  </div>
                ) : inboxItems.length > 0 ? (
                  <div className="space-y-3">
                    {inboxItems.map((item) => (
                      <article
                        key={item.id}
                        className={`rounded-[22px] border px-4 py-4 transition-all ${
                          item.readAt
                            ? "border-[#eadbd0] bg-white"
                            : "border-[#FE6100]/16 bg-[#fff8f3]"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-full bg-white/80 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#FE6100]">
                                {getNotificationTypeLabel(item.type)}
                              </span>
                              <span className="text-xs text-gray-500">{relativeTime(item.createdAt)}</span>
                            </div>
                            <h4 className="mt-3 text-sm font-semibold text-gray-950">{item.title}</h4>
                            <p className="mt-1 text-sm text-gray-600">{item.body}</p>
                          </div>
                          {!item.readAt ? (
                            <span className="mt-1 h-2.5 w-2.5 rounded-full bg-[#FE6100]" />
                          ) : null}
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2">
                          {item.href ? (
                            <Link
                              href={item.href}
                              onClick={() => {
                                void handleMarkRead(item.id);
                                setOpen(false);
                              }}
                              className="inline-flex items-center gap-2 rounded-2xl bg-white px-3 py-2 text-sm font-medium text-[#FE6100] shadow-sm transition-all hover:bg-[#fff2ea]"
                            >
                              Kaydi ac
                              <ExternalLink className="h-4 w-4" />
                            </Link>
                          ) : null}
                          {!item.readAt ? (
                            <button
                              type="button"
                              onClick={() => void handleMarkRead(item.id)}
                              className="inline-flex items-center gap-2 rounded-2xl border border-[#FE6100]/12 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-all hover:border-[#FE6100]/24 hover:text-[#FE6100]"
                            >
                              <CheckCheck className="h-4 w-4" />
                              Okundu yap
                            </button>
                          ) : null}
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-[22px] border border-dashed border-[#FE6100]/18 bg-white px-4 py-8 text-center text-sm text-gray-500">
                    Henüz bildirim kaydı yok.
                  </div>
                )}
              </div>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
