"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { usePathname } from "next/navigation";
import { AlertTriangle, ChevronDown, Loader2, RotateCcw, Send, Sparkles, X } from "lucide-react";
import { STORE_RUNTIME } from "@/lib/store-runtime";
import { cn } from "@/lib/utils";

interface Message {
  role: "user" | "model";
  text: string;
}

interface AlertInfo {
  count: number;
  summary: string;
}

interface ToshiAssistantProps {
  isMobile?: boolean;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  onAlertInfoChange?: (info: AlertInfo | null) => void;
}

type ToshiOpenEventDetail = {
  prompt?: string;
};

const STORAGE_KEY = `toshi_messages:${STORE_RUNTIME.slug}`;
const ALERT_CACHE_KEY = `toshi_alerts:${STORE_RUNTIME.slug}`;
const MAX_STORED_MESSAGES = 50;
const MAX_GEMINI_MESSAGES = 10;
const ALERT_CHECK_INTERVAL = 5 * 60 * 1000;
const TOSHI_MASCOT_SRC = "/branding/toshi-mascot.png";
const TOSHI_GRADIENT = "linear-gradient(135deg, #FF6A00 0%, #E85D04 100%)";

function ToshiMark({
  sizeClassName = "h-8 w-8",
  imageClassName = "h-5 w-5",
  shellClassName = "",
}: {
  sizeClassName?: string;
  imageClassName?: string;
  shellClassName?: string;
}) {
  return (
    <span
      className={`flex items-center justify-center rounded-full border border-white/18 bg-[rgba(255,255,255,0.16)] shadow-[inset_0_1px_0_rgba(255,255,255,0.22)] ${sizeClassName} ${shellClassName}`.trim()}
    >
      <Image src={TOSHI_MASCOT_SRC} alt="Toshi mascot" width={28} height={28} className={imageClassName} priority />
    </span>
  );
}

function getQuickPrompts(pathname: string): string[] {
  if (pathname === "/admin" || pathname === "/admin/") {
    return ["Mağaza özeti", "Umami trafik özeti", "Bekleyen siparişler", "Düşük stok uyarıları"];
  }

  if (pathname.startsWith("/admin/siparisler")) {
    return ["Sipariş özeti", "Bekleyen siparişler", "Son siparişler", "Bugünkü gelir"];
  }

  if (pathname.startsWith("/admin/urunler")) {
    return ["Stok durumu", "Düşük stok uyarıları", "Kategori listesi", "Stok değeri hesapla"];
  }

  if (pathname.startsWith("/admin/musteriler")) {
    return ["Müşteri istatistikleri", "Bu ay yeni müşteri", "Ortalama sipariş değeri nedir?"];
  }

  if (pathname.startsWith("/admin/indirimler")) {
    return ["Aktif indirimler", "%20 indirimde kâr marjı hesapla", "İndirim önerisi"];
  }

  if (pathname.startsWith("/admin/pazarlama")) {
    return ["Pazarlama önerisi", "Kampanya fikri", "Müşteri segmenti analizi"];
  }

  if (pathname.startsWith("/admin/cms")) {
    return ["Blog yazısı önerisi", "SEO ipuçları", "İçerik stratejisi"];
  }

  if (pathname.startsWith("/admin/seo")) {
    return ["SEO durumu", "Anahtar kelime önerisi", "Meta açıklama nasıl yazılır?"];
  }

  return ["Mağaza özeti", "Düşük stok uyarıları", "Son siparişler", "Yardım"];
}

function getPageContext(pathname: string): string {
  const map: Record<string, string> = {
    "/admin": "Ana panel. Sipariş, ürün ve operasyon özeti burada.",
    "/admin/siparisler": "Siparişler. Tüm sipariş listesi ve durum yönetimi.",
    "/admin/urunler": "Ürünler. Katalog, stok ve ürün yönetimi.",
    "/admin/musteriler": "Müşteriler. Profil, segment ve sipariş geçmişi.",
    "/admin/indirimler": "İndirimler. Kampanya ve kupon akışı.",
    "/admin/cms": "CMS. Blog, sayfa ve politika içerikleri.",
    "/admin/seo-killer": "SEO. Arama görünürlüğü ve içerik optimizasyonu.",
    "/admin/pazarlama": "Pazarlama. Kampanya araçları ve mesaj akışı.",
    "/admin/ayarlar": "Ayarlar. Mağaza, cihaz ve entegrasyon ayarları.",
    "/admin/yoneticiler": "Yöneticiler. Yetki ve ekip yönetimi.",
    "/admin/markets": "Marketplace. Kanal ve entegrasyon görünümü.",
  };

  if (map[pathname]) {
    return map[pathname];
  }

  for (const [key, value] of Object.entries(map)) {
    if (key !== "/admin" && pathname.startsWith(key)) {
      return value;
    }
  }

  if (pathname.startsWith("/admin")) {
    return `Admin paneli: ${pathname}`;
  }

  return `${STORE_RUNTIME.name} web sitesi: ${pathname}`;
}

function renderLine(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);

  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={index} className="font-semibold">
          {part.slice(2, -2)}
        </strong>
      );
    }

    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={index} className="rounded bg-[#fff1e6] px-1 py-0.5 text-xs font-mono text-[#b45309]">
          {part.slice(1, -1)}
        </code>
      );
    }

    return <span key={index}>{part}</span>;
  });
}

function renderMessage(text: string) {
  return text.split("\n").map((line, index) => {
    const trimmed = line.trim();

    if (trimmed === "") {
      return <div key={index} className="h-1" />;
    }

    if (/^\s*[-•·]\s/.test(line)) {
      const content = line.replace(/^\s*[-•·]\s*/, "");
      return (
        <div key={index} className="flex gap-1.5">
          <span className="mt-0.5 flex-shrink-0 text-[#f08a3c]">•</span>
          <span>{renderLine(content)}</span>
        </div>
      );
    }

    if (/^\s*\d+[.)]\s/.test(line)) {
      const match = line.match(/^\s*(\d+)[.)]\s*(.*)/);
      if (match) {
        return (
          <div key={index} className="flex gap-1.5">
            <span className="min-w-[16px] flex-shrink-0 font-medium text-[#d95a08]">{match[1]}.</span>
            <span>{renderLine(match[2])}</span>
          </div>
        );
      }
    }

    return (
      <p key={index} className={index > 0 ? "mt-1" : ""}>
        {renderLine(line)}
      </p>
    );
  });
}

function loadMessages(): Message[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return [];
    }

    return (JSON.parse(stored) as Message[]).slice(-MAX_STORED_MESSAGES);
  } catch {
    return [];
  }
}

function saveMessages(messages: Message[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-MAX_STORED_MESSAGES)));
  } catch {
    // no-op
  }
}

function clearMessages() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // no-op
  }
}

function loadAlertCache(): { data: AlertInfo; ts: number } | null {
  try {
    const raw = localStorage.getItem(ALERT_CACHE_KEY);
    if (!raw) {
      return null;
    }

    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveAlertCache(data: AlertInfo) {
  try {
    localStorage.setItem(ALERT_CACHE_KEY, JSON.stringify({ data, ts: Date.now() }));
  } catch {
    // no-op
  }
}

export default function ToshiAssistant({
  isMobile = false,
  isOpen,
  onOpenChange,
  onAlertInfoChange,
}: ToshiAssistantProps) {
  const pathname = usePathname() ?? "";
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [alertInfo, setAlertInfo] = useState<AlertInfo | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const isAdmin = pathname.startsWith("/admin");
  const panelIsOpen = typeof isOpen === "boolean" ? isOpen : internalIsOpen;
  const contextHint = getPageContext(pathname);

  const setPanelOpen = useCallback(
    (next: boolean) => {
      if (typeof isOpen !== "boolean") {
        setInternalIsOpen(next);
      }

      onOpenChange?.(next);
    },
    [isOpen, onOpenChange],
  );

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    if (panelIsOpen && !isMinimized && !isMobile) {
      window.setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isMobile, panelIsOpen, isMinimized]);

  useEffect(() => {
    if (isMobile) {
      setIsMinimized(false);
    }
  }, [isMobile]);

  useEffect(() => {
    if (!isAdmin) {
      setAlertInfo(null);
      return;
    }

    const checkAlerts = async () => {
      const cached = loadAlertCache();
      if (cached && Date.now() - cached.ts < ALERT_CHECK_INTERVAL) {
        setAlertInfo(cached.data.count > 0 ? cached.data : null);
        return;
      }

      try {
        const [ordersRes, productsRes] = await Promise.all([
          fetch("/api/orders?stats=true")
            .then((response) => response.json())
            .catch(() => null),
          fetch("/api/products?limit=100")
            .then((response) => response.json())
            .catch(() => null),
        ]);

        let count = 0;
        const alerts: string[] = [];

        const pending = ordersRes?.stats?.pending || 0;
        if (pending > 0) {
          count += pending;
          alerts.push(`${pending} bekleyen sipariş`);
        }

        const lowStockProducts = (productsRes?.products || []).filter(
          (product: { variants?: { stock: number }[] }) =>
            product.variants?.some((variant) => variant.stock < 10),
        );

        if (lowStockProducts.length > 0) {
          count += lowStockProducts.length;
          alerts.push(`${lowStockProducts.length} düşük stoklu ürün`);
        }

        const nextAlertInfo: AlertInfo = {
          count,
          summary: alerts.join(" · "),
        };

        setAlertInfo(nextAlertInfo.count > 0 ? nextAlertInfo : null);
        saveAlertCache(nextAlertInfo);
      } catch {
        // no-op
      }
    };

    void checkAlerts();
    const intervalId = window.setInterval(checkAlerts, ALERT_CHECK_INTERVAL);
    return () => window.clearInterval(intervalId);
  }, [isAdmin]);

  useEffect(() => {
    onAlertInfoChange?.(alertInfo);
  }, [alertInfo, onAlertInfoChange]);

  useEffect(() => {
    if (!panelIsOpen || isInitialized) {
      return;
    }

    setIsInitialized(true);

    const storedMessages = loadMessages();
    if (storedMessages.length > 0) {
      setMessages(storedMessages);
      return;
    }

    let greeting = `Merhaba, ben **Toshi**.\n\n${STORE_RUNTIME.name} admininde sipariş, ürün ve müşteri verilerinde yardımcı olabilirim.`;

    if (alertInfo && alertInfo.count > 0) {
      greeting += `\n\n⚠️ **Dikkat:** ${alertInfo.summary}. Detay için sor.`;
    }

    greeting += "\n\nNe lazım?";

    const initialMessages: Message[] = [{ role: "model", text: greeting }];
    setMessages(initialMessages);
    saveMessages(initialMessages);
  }, [alertInfo, isInitialized, panelIsOpen]);

  useEffect(() => {
    if (!isAdmin) {
      return;
    }

    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();

        if (panelIsOpen) {
          inputRef.current?.focus();
        } else {
          setPanelOpen(true);
          setIsMinimized(false);
        }
      }

      if (event.key === "Escape" && panelIsOpen) {
        setPanelOpen(false);
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isAdmin, panelIsOpen, setPanelOpen]);

  useEffect(() => {
    if (!isAdmin) {
      return;
    }

    const handleOpenEvent = (event: Event) => {
      const customEvent = event as CustomEvent<ToshiOpenEventDetail | undefined>;
      const prompt = customEvent.detail?.prompt?.trim();

      setPanelOpen(true);
      setIsMinimized(false);

      if (prompt) {
        setInput(prompt);
      }
    };

    window.addEventListener("celebix:toshi-open", handleOpenEvent as EventListener);

    return () => {
      window.removeEventListener("celebix:toshi-open", handleOpenEvent as EventListener);
    };
  }, [isAdmin, setPanelOpen]);

  const sendMessage = useCallback(
    async (text?: string) => {
      const nextText = text ?? input.trim();
      if (!nextText || isLoading) {
        return;
      }

      const userMessage: Message = { role: "user", text: nextText };
      const updatedMessages = [...messages, userMessage];
      setMessages(updatedMessages);
      saveMessages(updatedMessages);
      setInput("");
      setIsLoading(true);

      const history = updatedMessages.slice(-MAX_GEMINI_MESSAGES).map((message) => ({
        role: message.role,
        parts: [{ text: message.text }],
      }));

      try {
        const response = await fetch("/api/admin/assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: history,
            context: contextHint,
          }),
        });

        const data = await response.json();

        if (!response.ok || data.error) {
          const withError = [
            ...updatedMessages,
            {
              role: "model" as const,
              text: `⚠️ ${data.error || "Bir hata oluştu. Tekrar dene."}`,
            },
          ];
          setMessages(withError);
          saveMessages(withError);
        } else {
          const withReply = [
            ...updatedMessages,
            {
              role: "model" as const,
              text: data.text ?? "Üzgünüm, yanıt oluşturulamadı.",
            },
          ];
          setMessages(withReply);
          saveMessages(withReply);
        }
      } catch {
        const withError = [
          ...updatedMessages,
          {
            role: "model" as const,
            text: "⚠️ Bağlantı hatası oluştu. İnternet bağlantını kontrol et.",
          },
        ];
        setMessages(withError);
        saveMessages(withError);
      } finally {
        setIsLoading(false);
      }
    },
    [contextHint, input, isLoading, messages],
  );

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  };

  const handleReset = () => {
    const greeting: Message[] = [
      {
        role: "model",
        text: "Konuşma sıfırlandı. Ben **Toshi**. Sana nasıl yardımcı olabilirim?",
      },
    ];

    setMessages(greeting);
    clearMessages();
    saveMessages(greeting);
    setInput("");
  };

  if (!isAdmin) {
    return null;
  }

  const quickPrompts = getQuickPrompts(pathname);
  const showQuickPrompts = messages.every((message) => message.role !== "user");

  const panelContent = (
    <>
      <div className="flex-1 space-y-3 overflow-y-auto bg-[linear-gradient(180deg,#ffffff_0%,#f9f9f9_100%)] px-4 py-4">
        <div className="grid gap-2.5">
          {alertInfo ? (
            <div className="rounded-[1.35rem] border border-[var(--admin-accent-border)] bg-[var(--admin-accent-soft)] px-4 py-3.5 text-sm text-[var(--admin-accent-hover)] shadow-[0_12px_24px_rgba(255,106,0,0.08)]">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[1rem] bg-white text-[#d95a08]">
                  <AlertTriangle className="h-4.5 w-4.5" />
                </span>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#d95a08]">
                    Operasyon uyarısı
                  </p>
                  <p className="mt-1 text-sm font-medium text-[#7a4419]">{alertInfo.summary}</p>
                </div>
              </div>
            </div>
          ) : null}

          <div className="rounded-[1.35rem] border border-[var(--admin-border)] bg-white px-4 py-3.5 text-sm text-[var(--admin-text-secondary)] shadow-[0_10px_22px_rgba(17,24,39,0.06)]">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[1rem] bg-[#fff3e8] text-[#d95a08]">
                <Sparkles className="h-4.5 w-4.5" />
              </span>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#d95a08]">Bağlam</p>
                <p className="mt-1 text-sm leading-6">{contextHint}</p>
              </div>
            </div>
          </div>
        </div>

        {messages.map((message, index) => (
          <div
            key={`${message.role}-${index}`}
            className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
          >
            {message.role === "model" ? (
              <div className="mr-2 mt-0.5 flex-shrink-0">
                <ToshiMark
                  sizeClassName="h-7 w-7"
                  imageClassName="h-4.5 w-4.5"
                  shellClassName="border-[var(--admin-accent-border)] bg-[linear-gradient(135deg,#FF6A00_0%,#E85D04_100%)]"
                />
              </div>
            ) : null}

            <div
              className={cn(
                "max-w-[84%] rounded-[1.35rem] px-3.5 py-2.5 text-[0.95rem] leading-6",
                message.role === "user"
                  ? "rounded-tr-md bg-[linear-gradient(135deg,#FF6A00_0%,#E85D04_100%)] text-white shadow-[0_14px_24px_rgba(255,106,0,0.18)]"
                  : "rounded-tl-md border border-[var(--admin-border)] bg-white text-[var(--admin-text)] shadow-[0_10px_22px_rgba(17,24,39,0.06)]",
              )}
              style={{ wordBreak: "break-word" }}
            >
              {message.role === "model" ? renderMessage(message.text) : message.text}
            </div>
          </div>
        ))}

        {isLoading ? (
          <div className="flex justify-start">
            <div className="mr-2 mt-0.5 flex-shrink-0">
              <ToshiMark
                sizeClassName="h-7 w-7"
                imageClassName="h-4.5 w-4.5"
                shellClassName="border-[var(--admin-accent-border)] bg-[linear-gradient(135deg,#FF6A00_0%,#E85D04_100%)]"
              />
            </div>
            <div className="flex items-center gap-2 rounded-[1.35rem] rounded-tl-md border border-[#f1dfd0] bg-white px-3.5 py-2.5 shadow-[0_10px_22px_rgba(106,67,37,0.08)]">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-[#d95a08]" />
              <span className="text-xs text-gray-500">Veri çekiliyor...</span>
            </div>
          </div>
        ) : null}

        <div ref={messagesEndRef} />
      </div>

      {showQuickPrompts ? (
        <div className="border-t border-[var(--admin-border)] bg-white px-4 py-3">
          <div className={cn("gap-2", isMobile ? "grid grid-cols-2" : "flex flex-wrap")}>
            {quickPrompts.map((prompt) => (
              <button
                key={prompt}
                onClick={() => void sendMessage(prompt)}
                className="min-h-[44px] rounded-[1rem] border border-[var(--admin-accent-border)] bg-[var(--admin-accent-soft)] px-3.5 py-2.5 text-[13px] font-medium text-[var(--admin-accent-hover)] transition-colors hover:bg-[#ffe8d8]"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div
        className={`flex-shrink-0 border-t border-[var(--admin-border)] bg-white ${isMobile ? "px-4 pt-3.5" : "px-3.5 py-3.5"}`}
        style={isMobile ? { paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" } : undefined}
      >
        <div className="flex items-end gap-2.5 rounded-[1.35rem] border border-[var(--admin-border)] bg-[var(--admin-bg)] px-3.5 py-3 transition-all focus-within:border-[var(--admin-accent)] focus-within:ring-2 focus-within:ring-[color:rgba(255,106,0,0.12)]">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Toshi'ye sor..."
            rows={1}
            aria-label="Toshi mesaj alanı"
            className="min-h-[24px] max-h-[96px] flex-1 resize-none bg-transparent text-base leading-6 text-[var(--admin-text)] outline-none placeholder:text-[var(--admin-text-muted)] md:text-[0.95rem]"
            style={{ overflow: "auto" }}
            disabled={isLoading}
          />
          <button
            onClick={() => void sendMessage()}
            disabled={!input.trim() || isLoading}
            aria-label="Mesaj gönder"
            className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-[1rem] transition-all disabled:opacity-30"
            style={{
              background: input.trim() && !isLoading ? TOSHI_GRADIENT : "#e5e7eb",
            }}
          >
            <Send
              className="h-4 w-4"
              style={{
                color: input.trim() && !isLoading ? "#fff" : "#9ca3af",
              }}
            />
          </button>
        </div>
        {!isMobile ? (
          <p className="mt-1.5 text-center text-[10px] text-gray-400">Enter ile gönder · Ctrl+K · Esc</p>
        ) : null}
      </div>
    </>
  );

  return (
    <>
      {!isMobile && panelIsOpen ? (
        <div
          className="fixed bottom-6 right-6 z-[9999] flex flex-col overflow-hidden rounded-[12px] shadow-2xl"
          style={{
            width: "408px",
            height: isMinimized ? "60px" : "620px",
            background: "#fff",
            border: "1px solid rgba(231,234,240,1)",
            boxShadow: "0 26px 64px rgba(17,24,39,0.12), 0 2px 16px rgba(17,24,39,0.06)",
            transition: "height 0.25s cubic-bezier(.4,0,.2,1)",
          }}
        >
          <div
            className="flex flex-shrink-0 select-none items-center justify-between px-4 py-3.5"
            style={{ background: TOSHI_GRADIENT }}
          >
            <div className="flex items-center gap-2.5">
              <ToshiMark sizeClassName="h-9 w-9" imageClassName="h-5.5 w-5.5" shellClassName="border-white/20 bg-white/18" />
              <div>
                <p className="text-sm font-semibold leading-tight text-white">Toshi</p>
                <p className="text-xs leading-tight text-[#ffe2ce]">Operasyon asistanı</p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={handleReset}
                title="Konuşmayı sıfırla"
                className="rounded-[8px] p-1.5 text-white/75 transition-colors hover:bg-white/20 hover:text-white"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
              <button
                onClick={() => setIsMinimized((current) => !current)}
                title="Küçült"
                className="rounded-[8px] p-1.5 text-white/75 transition-colors hover:bg-white/20 hover:text-white"
              >
                <ChevronDown
                  className="h-4 w-4 transition-transform duration-200"
                  style={{ transform: isMinimized ? "rotate(180deg)" : "rotate(0deg)" }}
                />
              </button>
              <button
                onClick={() => setPanelOpen(false)}
                title="Kapat (Esc)"
                className="rounded-[8px] p-1.5 text-white/75 transition-colors hover:bg-white/20 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {!isMinimized ? panelContent : null}
        </div>
      ) : null}

      {isMobile && panelIsOpen ? (
        <>
          <button
            type="button"
            aria-label="Toshi panelini kapat"
            onClick={() => setPanelOpen(false)}
            className="fixed inset-x-0 top-[var(--admin-mobile-panel-top)] bottom-[var(--admin-mobile-panel-bottom)] z-[70] bg-[rgba(17,24,39,0.12)] backdrop-blur-[2px]"
          />

          <div className="fixed inset-x-2 top-[var(--admin-mobile-panel-top)] bottom-[var(--admin-mobile-panel-bottom)] z-[78] flex flex-col overflow-hidden rounded-[2rem] border border-[var(--admin-border)] bg-white shadow-[var(--shadow-xs)]">
            <div
              className="relative flex flex-shrink-0 select-none items-center justify-between px-4 py-4"
              style={{ background: TOSHI_GRADIENT }}
            >
              <div className="absolute left-1/2 top-2 h-1.5 w-14 -translate-x-1/2 rounded-full bg-white/45" />

              <div className="flex items-center gap-2.5">
                <ToshiMark sizeClassName="h-9 w-9" imageClassName="h-5.5 w-5.5" shellClassName="border-white/20 bg-white/18" />
                <div>
                  <p className="text-sm font-semibold leading-tight text-white">Toshi</p>
                  <p className="text-xs leading-tight text-[#ffe2ce]">Mobil operasyon asistanı</p>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={handleReset}
                  title="Konuşmayı sıfırla"
                  className="rounded-[8px] p-1.5 text-white/75 transition-colors hover:bg-white/20 hover:text-white"
                >
                  <RotateCcw className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setPanelOpen(false)}
                  title="Kapat"
                  className="rounded-[8px] p-1.5 text-white/75 transition-colors hover:bg-white/20 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {panelContent}
          </div>
        </>
      ) : null}

      <style jsx global>{`
        @keyframes toshi-badge-pulse {
          0%,
          100% {
            transform: scale(1);
          }
          50% {
            transform: scale(1.15);
          }
        }
      `}</style>
    </>
  );
}
