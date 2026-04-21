"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { usePathname } from "next/navigation";
import { ChevronDown, Loader2, RotateCcw, Send, X } from "lucide-react";
import { STORE_RUNTIME } from "@/lib/store-runtime";

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

const STORAGE_KEY = "toshi_messages";
const ALERT_CACHE_KEY = "toshi_alerts";
const MAX_STORED_MESSAGES = 50;
const MAX_GEMINI_MESSAGES = 10;
const ALERT_CHECK_INTERVAL = 5 * 60 * 1000;

function getQuickPrompts(pathname: string): string[] {
  if (pathname === "/admin" || pathname === "/admin/") {
    return ["Mağaza özeti", "Bekleyen siparişler", "Düşük stok uyarıları", "Müşteri istatistikleri"];
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

  if (pathname.startsWith("/admin/analizler")) {
    return ["Mağaza özeti", "Gelir analizi", "Ortalama sipariş değeri", "Büyüme oranı"];
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
    "/admin": "Admin paneli ana sayfası. Sipariş, ürün ve satış özeti görüntüleniyor.",
    "/admin/siparisler": "Siparişler sayfası. Tüm siparişlerin listesi ve durum yönetimi.",
    "/admin/urunler": "Ürünler sayfası. Ürün listesi, stok takibi ve ürün yönetimi.",
    "/admin/musteriler": "Müşteriler sayfası. Müşteri listesi ve detayları.",
    "/admin/indirimler": "İndirimler sayfası. Kupon ve kampanya yönetimi.",
    "/admin/analizler": "Analizler sayfası. Satış grafikleri ve performans verileri.",
    "/admin/cms": "CMS sayfası. Blog yazıları ve içerik yönetimi.",
    "/admin/seo-killer": "SEO sayfası. Arama motoru optimizasyon ayarları.",
    "/admin/pazarlama": "Pazarlama sayfası. Pazarlama araçları ve kampanyalar.",
    "/admin/ayarlar": "Ayarlar sayfası. Mağaza konfigürasyon ayarları.",
    "/admin/yoneticiler": "Yöneticiler sayfası. Admin kullanıcı yönetimi.",
    "/admin/markets": "Marketler sayfası.",
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
        <code
          key={index}
          className="rounded bg-violet-100 px-1 py-0.5 text-xs font-mono text-violet-800"
        >
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
          <span className="mt-0.5 flex-shrink-0 text-violet-400">•</span>
          <span>{renderLine(content)}</span>
        </div>
      );
    }

    if (/^\s*\d+[.)]\s/.test(line)) {
      const match = line.match(/^\s*(\d+)[.)]\s*(.*)/);
      if (match) {
        return (
          <div key={index} className="flex gap-1.5">
            <span className="min-w-[16px] flex-shrink-0 font-medium text-violet-500">
              {match[1]}.
            </span>
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
    if (panelIsOpen && !isMinimized) {
      window.setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [panelIsOpen, isMinimized]);

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

    checkAlerts();
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

    let greeting = `Merhaba! Ben **Toshi**. ${STORE_RUNTIME.name} için çalışan AI admin asistanınım.\n\nSana **gerçek zamanlı** sipariş, ürün ve müşteri verileriyle yardımcı olabilirim. Matematiksel hesaplamalar da yapabilirim.`;

    if (alertInfo && alertInfo.count > 0) {
      greeting += `\n\n⚠️ **Dikkat:** ${alertInfo.summary}. Detay için sor.`;
    }

    greeting += "\n\nNe öğrenmek istersin?";

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

  const handleOpen = () => {
    setPanelOpen(true);
    setIsMinimized(false);
  };

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
            context: getPageContext(pathname),
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
    [input, isLoading, messages, pathname],
  );

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  };

  const handleReset = () => {
    const greeting: Message[] = [
      {
        role: "model",
        text: "Konuşma sıfırlandı! Ben **Toshi** 👋 Sana nasıl yardımcı olabilirim?",
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
      <div className="flex-1 space-y-3 overflow-y-auto bg-gray-50/50 px-4 py-3">
        {messages.map((message, index) => (
          <div
            key={`${message.role}-${index}`}
            className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
          >
            {message.role === "model" ? (
              <div className="mr-2 mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-indigo-600">
                <span className="text-[10px] font-bold text-white">T</span>
              </div>
            ) : null}

            <div
              className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                message.role === "user"
                  ? "rounded-tr-sm bg-gradient-to-br from-violet-600 to-indigo-600 text-white"
                  : "rounded-tl-sm border border-gray-100 bg-white text-gray-800 shadow-sm"
              }`}
              style={{ wordBreak: "break-word" }}
            >
              {message.role === "model" ? renderMessage(message.text) : message.text}
            </div>
          </div>
        ))}

        {isLoading ? (
          <div className="flex justify-start">
            <div className="mr-2 mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-indigo-600">
              <span className="text-[10px] font-bold text-white">T</span>
            </div>
            <div className="flex items-center gap-1.5 rounded-2xl rounded-tl-sm border border-gray-100 bg-white px-3 py-2.5 shadow-sm">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-500" />
              <span className="text-xs text-gray-400">Veri çekiliyor...</span>
            </div>
          </div>
        ) : null}

        <div ref={messagesEndRef} />
      </div>

      {showQuickPrompts ? (
        <div className="flex flex-wrap gap-1.5 border-t border-gray-100 bg-white px-4 pb-2">
          {quickPrompts.map((prompt) => (
            <button
              key={prompt}
              onClick={() => sendMessage(prompt)}
              className="mt-2 whitespace-nowrap rounded-full border border-violet-200 px-2.5 py-1 text-xs text-violet-600 transition-colors hover:bg-violet-50"
            >
              {prompt}
            </button>
          ))}
        </div>
      ) : null}

      <div
        className={`flex-shrink-0 border-t border-gray-100 bg-white ${isMobile ? "px-4 pt-3" : "px-3 py-3"}`}
        style={
          isMobile
            ? { paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 14px)" }
            : undefined
        }
      >
        <div className="flex items-end gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 transition-all focus-within:border-violet-400 focus-within:ring-2 focus-within:ring-violet-100">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Toshi'ye sor..."
            rows={1}
            className="min-h-[20px] max-h-[80px] flex-1 resize-none bg-transparent text-sm leading-5 text-gray-800 outline-none placeholder:text-gray-400"
            style={{ overflow: "auto" }}
            disabled={isLoading}
          />
          <button
            onClick={() => sendMessage()}
            disabled={!input.trim() || isLoading}
            className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg transition-all disabled:opacity-30"
            style={{
              background:
                input.trim() && !isLoading
                  ? "linear-gradient(135deg, #7c3aed, #4f46e5)"
                  : "#e5e7eb",
            }}
          >
            <Send
              className="h-3.5 w-3.5"
              style={{
                color: input.trim() && !isLoading ? "#fff" : "#9ca3af",
              }}
            />
          </button>
        </div>
        <p className="mt-1.5 text-center text-[10px] text-gray-300">
          {isMobile ? "Enter ile gönder" : "Enter ile gönder · Ctrl+K kısayol · Esc kapat"}
        </p>
      </div>
    </>
  );

  return (
    <>
      {!isMobile && !panelIsOpen ? (
        <button
          onClick={handleOpen}
          aria-label="Toshi AI Asistanı Aç (Ctrl+K)"
          className="group fixed bottom-6 right-6 z-[9999]"
          style={{
            filter: "drop-shadow(0 8px 24px rgba(124,58,237,0.45))",
          }}
        >
          <div
            className="relative flex h-14 w-14 items-center justify-center rounded-full transition-transform duration-200 group-hover:scale-110 group-active:scale-95"
            style={{
              background: "linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)",
            }}
          >
            <span className="absolute inset-0 rounded-full bg-violet-500 opacity-20 animate-ping" />
            <span className="select-none text-xl font-bold tracking-tight text-white">T</span>

            {alertInfo && alertInfo.count > 0 ? (
              <span
                className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white shadow-lg"
                style={{
                  animation: "toshi-badge-pulse 2s ease-in-out infinite",
                }}
              >
                {alertInfo.count > 9 ? "9+" : alertInfo.count}
              </span>
            ) : null}
          </div>

          <span className="pointer-events-none absolute right-16 top-1/2 -translate-y-1/2 whitespace-nowrap rounded-lg bg-gray-900 px-2 py-1 text-xs text-white opacity-0 transition-opacity duration-200 group-hover:opacity-100">
            {alertInfo && alertInfo.count > 0 ? alertInfo.summary : "Toshi'ye sor (Ctrl+K)"}
          </span>
        </button>
      ) : null}

      {!isMobile && panelIsOpen ? (
        <div
          className="fixed bottom-6 right-6 z-[9999] flex flex-col overflow-hidden rounded-2xl shadow-2xl"
          style={{
            width: "400px",
            height: isMinimized ? "56px" : "560px",
            background: "#fff",
            border: "1px solid rgba(124,58,237,0.15)",
            boxShadow: "0 24px 64px rgba(124,58,237,0.18), 0 2px 16px rgba(0,0,0,0.08)",
            transition: "height 0.25s cubic-bezier(.4,0,.2,1)",
          }}
        >
          <div
            className="flex flex-shrink-0 select-none items-center justify-between px-4 py-3"
            style={{
              background: "linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)",
            }}
          >
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20">
                <span className="text-sm font-bold text-white">T</span>
              </div>
              <div>
                <p className="text-sm font-semibold leading-tight text-white">Toshi</p>
                <p className="text-xs leading-tight text-violet-200">AI Asistan · Gerçek zamanlı</p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={handleReset}
                title="Konuşmayı sıfırla"
                className="rounded-lg p-1.5 text-white/70 transition-colors hover:bg-white/20 hover:text-white"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setIsMinimized((current) => !current)}
                title="Küçült"
                className="rounded-lg p-1.5 text-white/70 transition-colors hover:bg-white/20 hover:text-white"
              >
                <ChevronDown
                  className="h-3.5 w-3.5 transition-transform duration-200"
                  style={{
                    transform: isMinimized ? "rotate(180deg)" : "rotate(0deg)",
                  }}
                />
              </button>
              <button
                onClick={() => setPanelOpen(false)}
                title="Kapat (Esc)"
                className="rounded-lg p-1.5 text-white/70 transition-colors hover:bg-white/20 hover:text-white"
              >
                <X className="h-3.5 w-3.5" />
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
            className="fixed inset-0 z-[9998] bg-[#1f1724]/40 backdrop-blur-[2px]"
          />

          <div
            className="fixed inset-x-0 z-[9999] flex flex-col overflow-hidden rounded-t-[28px] border border-violet-200 bg-white shadow-[0_-18px_48px_rgba(79,70,229,0.24)]"
            style={{
              bottom: "calc(env(safe-area-inset-bottom, 0px) + 84px)",
              height:
                "min(720px, calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 96px))",
            }}
          >
            <div
              className="relative flex flex-shrink-0 select-none items-center justify-between px-4 pb-3 pt-2.5"
              style={{
                background: "linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)",
              }}
            >
              <div className="absolute left-1/2 top-2 h-1.5 w-14 -translate-x-1/2 rounded-full bg-white/45" />

              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20">
                  <span className="text-sm font-bold text-white">T</span>
                </div>
                <div>
                  <p className="text-sm font-semibold leading-tight text-white">Toshi</p>
                  <p className="text-xs leading-tight text-violet-200">AI Asistan · Gerçek zamanlı</p>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={handleReset}
                  title="Konuşmayı sıfırla"
                  className="rounded-lg p-1.5 text-white/70 transition-colors hover:bg-white/20 hover:text-white"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => setPanelOpen(false)}
                  title="Kapat"
                  className="rounded-lg p-1.5 text-white/70 transition-colors hover:bg-white/20 hover:text-white"
                >
                  <X className="h-3.5 w-3.5" />
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
