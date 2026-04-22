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
  X,
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
  syncNotificationCenter,
} from "@/lib/notifications";
import { cn } from "@/lib/utils";

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
    return `${diffMinutes} dk önce`;
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours} sa önce`;
  }

  const diffDays = Math.round(diffHours / 24);
  return `${diffDays} gün önce`;
}

function getNotificationTypeLabel(type: AdminInboxNotificationRecord["type"]) {
  switch (type) {
    case "new_order":
      return "Yeni sipariş";
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

  return navigator.serviceWorker.register("/admin-sw.js", {
    scope: "/",
  });
}

export function AdminNotificationCenter({
  isMobile,
  isOpen,
  onOpenChange,
  onUnreadCountChange,
}: {
  isMobile: boolean;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  onUnreadCountChange?: (count: number) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncingPush, setSyncingPush] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [status, setStatus] = useState<NotificationCenterStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [backgroundSyncError, setBackgroundSyncError] = useState<string | null>(null);
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof window !== "undefined" && "Notification" in window ? Notification.permission : "default",
  );
  const [subscriptionEndpoint, setSubscriptionEndpoint] = useState<string | null>(null);

  const open = typeof isOpen === "boolean" ? isOpen : internalOpen;

  const setOpenState = useCallback(
    (next: boolean) => {
      if (typeof isOpen !== "boolean") {
        setInternalOpen(next);
      }
      onOpenChange?.(next);
    },
    [isOpen, onOpenChange],
  );

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
      // Unsupported badge errors are ignored.
    }
  }, []);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      const nextStatus = await getNotificationCenterStatus();
      setStatus(nextStatus);
      setStatusError(null);
      await applyAppBadge(nextStatus.inbox.unreadCount);
    } catch (error) {
      console.error("Notification center load failed:", error);
      setStatusError(error instanceof Error ? error.message : "Bildirim merkezi yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [applyAppBadge]);

  const runBackgroundSync = useCallback(
    async (force = false) => {
      try {
        const result = await syncNotificationCenter({ force });
        setBackgroundSyncError(null);
        if (result.updated) {
          await loadStatus();
        }
      } catch (error) {
        setBackgroundSyncError(
          error instanceof Error ? error.message : "Arka plan bildirim senkronu tamamlanamadı.",
        );
      }
    },
    [loadStatus],
  );

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
    if (!loading && status) {
      void runBackgroundSync();
    }
  }, [loading, runBackgroundSync, status]);

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

  useEffect(() => {
    onUnreadCountChange?.(unreadCount);
  }, [onUnreadCountChange, unreadCount]);

  const permissionLabel = useMemo(() => {
    if (permission === "granted") {
      return "İzin verildi";
    }
    if (permission === "denied") {
      return "İzin kapalı";
    }
    return "İzin bekleniyor";
  }, [permission]);

  const deliveryLabel = useMemo(() => {
    if (pushEnabled && webPushAvailable) {
      return "Push + Inbox";
    }
    if (inboxEnabled) {
      return "Inbox";
    }
    return "Kapalı";
  }, [inboxEnabled, pushEnabled, webPushAvailable]);

  const handleEnablePush = useCallback(async () => {
    if (!webPushAvailable || !status?.vapidPublicKey) {
      toast.error("Web push henüz hazır değil.");
      return;
    }

    setSyncingPush(true);

    try {
      const registration = await ensureServiceWorker();
      if (!registration) {
        throw new Error("Service worker kaydı desteklenmiyor.");
      }

      let nextPermission = permission;
      if ("Notification" in window && permission !== "granted") {
        nextPermission = await Notification.requestPermission();
        setPermission(nextPermission);
      }

      if (nextPermission !== "granted") {
        throw new Error("Tarayıcı bildirimi gerekli.");
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
        throw new Error("Push aboneliği eksik veri döndürdü.");
      }

      await savePushSubscription({
        endpoint: subscription.endpoint,
        p256dh,
        auth,
        userAgent: navigator.userAgent,
        platform: navigator.platform,
      });

      setSubscriptionEndpoint(subscription.endpoint);
      toast.success("Push bu cihaza bağlandı.");
      await loadStatus();
    } catch (error) {
      console.error("Enable push failed:", error);
      toast.error(error instanceof Error ? error.message : "Push bağlantısı kurulamadı.");
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
      toast.success("Push bu cihaz için kapatıldı.");
      await loadStatus();
    } catch (error) {
      console.error("Disable push failed:", error);
      toast.error(error instanceof Error ? error.message : "Push bağlantısı kaldırılamadı.");
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
      onUnreadCountChange?.(0);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Bildirimler güncellenemedi.");
    }
  }, [applyAppBadge, onUnreadCountChange]);

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
          onUnreadCountChange?.(nextUnreadCount);

          return {
            ...current,
            inbox: {
              unreadCount: nextUnreadCount,
              items: nextItems,
            },
          };
        });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Bildirim okunamadı.");
      }
    },
    [applyAppBadge, onUnreadCountChange],
  );

  const handleSendTest = useCallback(async () => {
    setSendingTest(true);
    try {
      await sendTestNotification();
      toast.success("Test bildirimi sıraya alındı.");
      await loadStatus();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Test bildirimi gönderilemedi.");
    } finally {
      setSendingTest(false);
    }
  }, [loadStatus]);

  const shellClassName = isMobile
    ? "fixed inset-x-2 top-[var(--admin-mobile-panel-top)] bottom-[var(--admin-mobile-panel-bottom)] z-[72] overflow-hidden rounded-[2rem] border border-[#ead8ca] bg-[linear-gradient(180deg,rgba(255,251,247,0.98)_0%,rgba(247,240,232,0.98)_100%)] shadow-[0_22px_60px_rgba(22,18,12,0.16)] backdrop-blur-2xl"
    : "absolute right-0 top-[calc(100%+0.75rem)] z-[72] w-[min(26rem,calc(100vw-2rem))] overflow-hidden rounded-[28px] border border-[#FE6100]/12 bg-white/96 shadow-[0_24px_60px_rgba(15,23,42,0.18)] backdrop-blur-xl";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpenState(!open)}
        className={cn(
          "relative inline-flex items-center justify-center border border-[#FE6100]/12 bg-white text-gray-700 shadow-sm transition-all hover:border-[#FE6100]/24 hover:text-[#FE6100] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FE6100]/15",
          isMobile ? "h-11 w-11 rounded-[18px]" : "h-10 w-10 rounded-2xl",
        )}
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
            className={
              isMobile
                ? "fixed inset-x-0 top-[var(--admin-mobile-panel-top)] bottom-[var(--admin-mobile-panel-bottom)] z-[68] bg-[rgba(33,22,14,0.1)] backdrop-blur-[2px]"
                : "fixed inset-0 z-[68] bg-[rgba(33,22,14,0.18)] backdrop-blur-[2px]"
            }
            onClick={() => setOpenState(false)}
          />

          <section className={shellClassName}>
            <div className="flex h-full min-h-0 flex-col overflow-hidden">
              <header className="relative flex items-start justify-between gap-3 border-b border-[#FE6100]/10 px-4 py-4 md:px-5">
                {isMobile ? (
                  <div className="absolute left-1/2 top-2 h-1.5 w-14 -translate-x-1/2 rounded-full bg-[#e9c9af]" />
                ) : null}

                <div className="min-w-0">
                  <div className="inline-flex items-center gap-2 rounded-full border border-[#FE6100]/10 bg-[#fff6f1] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#FE6100]">
                    Bildirimler
                  </div>
                  <h3 className="mt-3 text-lg font-semibold tracking-[-0.03em] text-gray-950">
                    {unreadCount > 0 ? `${unreadCount} okunmamış` : "Tümü görüldü"}
                  </h3>
                  <p className="mt-1 text-sm text-gray-500">Inbox ve cihaz bildirimi tek yerde.</p>
                </div>

                <button
                  type="button"
                  onClick={() => setOpenState(false)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[#FE6100]/10 bg-white text-gray-500 transition-all hover:text-[#FE6100] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FE6100]/15"
                  aria-label="Kapat"
                >
                  <X className="h-4 w-4" />
                </button>
              </header>

              <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 py-4 md:px-5">
                {statusError && !status ? (
                  <div className="rounded-[22px] border border-rose-200 bg-rose-50 px-4 py-5 text-sm text-rose-800">
                    <div className="flex items-start gap-3">
                      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-rose-900">Bildirim merkezi açılamadı</p>
                        <p className="mt-1">{statusError}</p>
                      </div>
                    </div>
                    <div className="mt-4">
                      <button
                        type="button"
                        onClick={() => void loadStatus()}
                        className="inline-flex items-center gap-2 rounded-2xl border border-rose-200 bg-white px-3 py-2 text-sm font-medium text-rose-700 transition-all hover:bg-rose-100"
                      >
                        <RefreshCw className="h-4 w-4" />
                        Yeniden dene
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-[1.45rem] border border-[#FE6100]/10 bg-[#fff8f3] px-4 py-4">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#FE6100]">Cihaz</p>
                        <p className="mt-2 text-base font-semibold text-gray-950">
                          {hasActiveSubscription ? "Push bağlı" : "Push bağlı değil"}
                        </p>
                        <p className="mt-1 text-sm text-gray-500">{permissionLabel}</p>
                      </div>

                      <div className="rounded-[1.45rem] border border-[#FE6100]/10 bg-white px-4 py-4">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#FE6100]">Dağıtım</p>
                        <p className="mt-2 text-base font-semibold text-gray-950">{deliveryLabel}</p>
                        <p className="mt-1 text-sm text-gray-500">
                          {unreadCount > 0 ? `${unreadCount} okunmamış bildirim bekliyor.` : "Inbox temiz."}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-2 sm:grid-cols-2">
                      {pushEnabled && webPushAvailable ? (
                        hasActiveSubscription ? (
                          <button
                            type="button"
                            onClick={() => void handleDisablePush()}
                            disabled={syncingPush}
                            className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-[1.15rem] border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 transition-all hover:bg-rose-100 disabled:opacity-60"
                          >
                            {syncingPush ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellOff className="h-4 w-4" />}
                            Bu cihazda kapat
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void handleEnablePush()}
                            disabled={syncingPush}
                            className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-[1.15rem] bg-gradient-to-r from-[#FE6100] to-[#E85A00] px-4 py-3 text-sm font-semibold text-white shadow-[0_16px_30px_rgba(254,97,0,0.24)] transition-all hover:from-[#E85A00] hover:to-[#D45500] disabled:opacity-60"
                          >
                            {syncingPush ? <Loader2 className="h-4 w-4 animate-spin" /> : <Smartphone className="h-4 w-4" />}
                            Cihazı bağla
                          </button>
                        )
                      ) : (
                        <div className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-[1.15rem] border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
                          <ShieldAlert className="h-4 w-4" />
                          Push hazır değil
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() => void handleSendTest()}
                        disabled={sendingTest}
                        className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-[1.15rem] border border-[#FE6100]/12 bg-white px-4 py-3 text-sm font-medium text-gray-700 transition-all hover:border-[#FE6100]/24 hover:text-[#FE6100] disabled:opacity-60"
                      >
                        {sendingTest ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                        Test gönder
                      </button>

                      <button
                        type="button"
                        onClick={() => void handleMarkAllRead()}
                        disabled={unreadCount === 0}
                        className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-[1.15rem] border border-[#FE6100]/12 bg-white px-4 py-3 text-sm font-medium text-gray-700 transition-all hover:border-[#FE6100]/24 hover:text-[#FE6100] disabled:opacity-60 sm:col-span-2"
                      >
                        <CheckCheck className="h-4 w-4" />
                        Tümünü okundu yap
                      </button>
                    </div>

                    {statusError ? (
                      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                        <div className="flex items-start gap-3">
                          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                          <span>{statusError}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => void loadStatus()}
                          className="inline-flex items-center gap-2 rounded-2xl border border-rose-200 bg-white px-3 py-2 text-sm font-medium text-rose-700 transition-all hover:bg-rose-100"
                        >
                          <RefreshCw className="h-4 w-4" />
                          Yeniden dene
                        </button>
                      </div>
                    ) : null}

                    {backgroundSyncError ? (
                      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                        <div className="flex items-start gap-3">
                          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                          <span>Arka plan senkronu tamamlanamadı.</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => void runBackgroundSync(true)}
                          className="inline-flex items-center gap-2 rounded-2xl border border-amber-300 bg-white px-3 py-2 text-sm font-medium text-amber-900 transition-all hover:bg-amber-100"
                        >
                          <RefreshCw className="h-4 w-4" />
                          Tekrar dene
                        </button>
                      </div>
                    ) : null}

                    <div className="mt-5 flex min-h-0 flex-1 flex-col overflow-hidden">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-gray-950">Inbox</p>
                          <p className="text-xs text-gray-500">İş akışını bozan olaylar burada toplanır.</p>
                        </div>
                        <Link
                          href="/admin/ayarlar/bildirimler"
                          className="inline-flex items-center gap-1 text-sm font-medium text-[#FE6100] transition-colors hover:text-[#D45500]"
                          onClick={() => setOpenState(false)}
                        >
                          Ayarlar
                          <ExternalLink className="h-4 w-4" />
                        </Link>
                      </div>

                      {loading && !status ? (
                        <div className="flex items-center gap-2 rounded-[22px] border border-[#FE6100]/10 bg-white px-4 py-6 text-sm text-gray-500">
                          <Loader2 className="h-4 w-4 animate-spin text-[#FE6100]" />
                          Bildirimler yükleniyor...
                        </div>
                      ) : inboxItems.length > 0 ? (
                        <div className="space-y-3 overflow-y-auto pr-1">
                          {inboxItems.map((item) => (
                            <article
                              key={item.id}
                              className={cn(
                                "rounded-[1.45rem] border px-4 py-4 transition-all",
                                item.readAt ? "border-[#eadbd0] bg-white" : "border-[#FE6100]/16 bg-[#fff8f3]",
                              )}
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
                                {!item.readAt ? <span className="mt-1 h-2.5 w-2.5 rounded-full bg-[#FE6100]" /> : null}
                              </div>

                              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                                {item.href ? (
                                  <Link
                                    href={item.href}
                                    onClick={() => {
                                      void handleMarkRead(item.id);
                                      setOpenState(false);
                                    }}
                                    className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[1rem] bg-white px-3 py-2.5 text-sm font-medium text-[#FE6100] shadow-sm transition-all hover:bg-[#fff2ea]"
                                  >
                                    Aç
                                    <ExternalLink className="h-4 w-4" />
                                  </Link>
                                ) : null}
                                {!item.readAt ? (
                                  <button
                                    type="button"
                                    onClick={() => void handleMarkRead(item.id)}
                                    className={cn(
                                      "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[1rem] border border-[#FE6100]/12 bg-white px-3 py-2.5 text-sm font-medium text-gray-700 transition-all hover:border-[#FE6100]/24 hover:text-[#FE6100]",
                                      !item.href ? "sm:col-span-2" : "",
                                    )}
                                  >
                                    <CheckCheck className="h-4 w-4" />
                                    Okundu
                                  </button>
                                ) : null}
                              </div>
                            </article>
                          ))}
                        </div>
                      ) : (
                        <div className="rounded-[22px] border border-dashed border-[#FE6100]/18 bg-white px-4 py-8 text-center text-sm text-gray-500">
                          Henüz bildirim yok.
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
