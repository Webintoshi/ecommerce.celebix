"use client";

import Link from "next/link";
import { ArrowRight, BarChart3, Copy, History, Info, MessageSquare, Package, Plus, Search, SendHorizonal, ShoppingBag } from "lucide-react";
import { type FormEvent, type KeyboardEvent, type ReactNode, type RefObject, useEffect, useRef, useState } from "react";
import type { ToshiConversation, ToshiConversationSummary, ToshiSource } from "@celebix/saas-contracts";
import { createToshiChatApi, ToshiChatApiError, type ToshiSendInput } from "@/lib/toshi-chat-ui/client";
import { createToshiLocalClient } from "@/lib/toshi-local/client";
import { parseToshiLocalIntent } from "@/lib/toshi-local/intent";
import { ToshiMessageBody } from "./ToshiMessageBody";
import styles from "./toshi.module.css";

type ConversationEntry = Readonly<{ id: string; role: "user" | "assistant"; text: string; sources?: readonly ToshiSource[]; createdAt?: string }>;
type ProviderPin = Readonly<{ provider: ToshiConversationSummary["provider"]; model: string }>;
type Submission = Readonly<{ operationId: string; input: ToshiSendInput }>;
const PROVIDER_NAMES = Object.freeze({ openai: "OpenAI", gemini: "Google Gemini", anthropic: "Anthropic Claude", deepseek: "DeepSeek" });
const LOCAL_UNAVAILABLE = "Mağaza verilerine şu anda ulaşılamıyor. Sorunuz korundu; yeniden deneyin.";

export function ToshiAssistant({ mode, headerActions, titleRef }: Readonly<{ mode: "drawer" | "page"; headerActions?: ReactNode; titleRef?: RefObject<HTMLHeadingElement | null> }>) {
  const [api] = useState(() => createToshiChatApi());
  const [localClient] = useState(() => createToshiLocalClient());
  const [conversation, setConversation] = useState<ToshiConversation | null>(null);
  const [conversations, setConversations] = useState<readonly ToshiConversationSummary[]>([]);
  const [defaultProvider, setDefaultProvider] = useState<ProviderPin | null | undefined>();
  const [localEntries, setLocalEntries] = useState<readonly ConversationEntry[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [pendingQuestion, setPendingQuestion] = useState("");
  const [error, setError] = useState("");
  const [recovery, setRecovery] = useState<Submission | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historySearch, setHistorySearch] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const loadRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(false);
  const pendingRef = useRef(false);
  const submissionRef = useRef<Submission | null>(null);
  const conversationRef = useRef<ToshiConversation | null>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const historyButtonRef = useRef<HTMLButtonElement>(null);
  const historySearchRef = useRef<HTMLInputElement>(null);
  const restoreHistoryFocus = useRef(false);
  const conversationElement = useRef<HTMLDivElement>(null);
  const followLatest = useRef(true);
  const pin = conversation ?? defaultProvider;
  const aiMode = pin !== null && pin !== undefined;
  const entries: readonly ConversationEntry[] = conversation?.messages ?? localEntries;
  const busy = pending || loading || recovery !== null;
  const disabled = busy || defaultProvider === undefined;
  const providerStatus = loading ? "Konuşmalar yükleniyor…" : pin ? `${PROVIDER_NAMES[pin.provider]} · ${pin.model}` : defaultProvider === null ? "Yerel mod" : "Bağlantı durumu alınamadı";
  const matchingConversations = conversations.filter((item) => item.title.toLocaleLowerCase("tr-TR").includes(historySearch.trim().toLocaleLowerCase("tr-TR")));

  function acceptConversation(value: ToshiConversation) {
    conversationRef.current = value;
    setConversation(value);
    const { messages: _messages, ...summary } = value;
    setConversations((current) => [summary, ...current.filter((item) => item.id !== value.id)].slice(0, 20));
  }

  async function refresh(selection: "latest" | "current" | "new" = "current") {
    loadRef.current?.abort();
    const controller = new AbortController();
    loadRef.current = controller;
    setLoading(true); setError("");
    try {
      const result = await api.list(controller.signal);
      if (!mountedRef.current || controller.signal.aborted || loadRef.current !== controller) return;
      setConversations(result.conversations); setDefaultProvider(result.defaultProvider);
      const selected = selection === "new" ? null : selection === "current" && conversationRef.current ? conversationRef.current.id : result.conversations[0]?.id;
      if (selected) {
        const value = await api.get(selected, controller.signal);
        if (!mountedRef.current || controller.signal.aborted || loadRef.current !== controller) return;
        acceptConversation(value);
      }
    } catch (caught) {
      if (mountedRef.current && !controller.signal.aborted && loadRef.current === controller) setError(caught instanceof ToshiChatApiError && caught.code !== "unavailable" ? caught.message : "Konuşmalar yüklenemedi. Yeniden deneyin.");
    } finally {
      if (loadRef.current === controller) { loadRef.current = null; if (mountedRef.current) setLoading(false); }
    }
  }

  useEffect(() => {
    mountedRef.current = true;
    void refresh("latest");
    return () => { mountedRef.current = false; abortRef.current?.abort(); loadRef.current?.abort(); };
  // The clients are created once; reopening reloads authorized durable history.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);

  useEffect(() => {
    const element = conversationElement.current;
    if (element && followLatest.current) element.scrollTop = element.scrollHeight;
  }, [entries, pendingQuestion, pending]);

  useEffect(() => {
    const textarea = composerRef.current;
    if (!textarea) return;
    textarea.style.height = "44px";
    textarea.style.height = `${Math.min(132, Math.max(44, textarea.scrollHeight))}px`;
  }, [input]);

  useEffect(() => {
    if (historyOpen) historySearchRef.current?.focus();
  }, [historyOpen]);

  useEffect(() => {
    if (loading || historyOpen || !restoreHistoryFocus.current) return;
    restoreHistoryFocus.current = false;
    const button = historyButtonRef.current;
    if (button && button.getClientRects().length > 0) button.focus();
    else composerRef.current?.focus({ preventScroll: true });
  }, [loading, historyOpen]);

  async function selectConversation(id: string) {
    if (pendingRef.current || loading || recovery) return;
    if (!id) { newConversation(); return; }
    loadRef.current?.abort();
    const controller = new AbortController(); loadRef.current = controller;
    setLoading(true); setError("");
    try {
      const value = await api.get(id, controller.signal);
      if (mountedRef.current && !controller.signal.aborted && loadRef.current === controller) {
        acceptConversation(value); setInput(""); followLatest.current = true;
        restoreHistoryFocus.current = true; setHistoryOpen(false);
      }
    } catch (caught) {
      if (mountedRef.current && !controller.signal.aborted && loadRef.current === controller) {
        setError(caught instanceof ToshiChatApiError && caught.code !== "unavailable" ? caught.message : "Konuşma yüklenemedi. Yeniden deneyin.");
        restoreHistoryFocus.current = true; setHistoryOpen(false);
      }
    } finally { if (loadRef.current === controller) { loadRef.current = null; if (mountedRef.current) setLoading(false); } }
  }

  function newConversation() {
    if (pendingRef.current || loading || recovery) return;
    conversationRef.current = null; setConversation(null); setLocalEntries([]); setError(""); setInput("");
    if (historyOpen) restoreHistoryFocus.current = true;
    setHistoryOpen(false); setHistorySearch(""); setCopyStatus("");
    followLatest.current = true;
    void refresh("new");
  }

  async function send(submission: Submission | null, command: string) {
    if (pendingRef.current || loading) return;
    pendingRef.current = true; setPending(true); setError(""); setPendingQuestion(command); setCopyStatus("");
    const controller = new AbortController(); abortRef.current = controller; submissionRef.current = submission;
    followLatest.current = true;
    try {
      if (submission) {
        const value = await api.send(submission.input, submission.operationId, controller.signal);
        if (!mountedRef.current || controller.signal.aborted || abortRef.current !== controller) return;
        acceptConversation(value); setRecovery(null);
      } else {
        const reply = await localClient.execute(parseToshiLocalIntent(command), controller.signal);
        if (!mountedRef.current || controller.signal.aborted || abortRef.current !== controller) return;
        setLocalEntries((current) => [...current, { id: crypto.randomUUID(), role: "user" as const, text: command }, { id: crypto.randomUUID(), role: "assistant" as const, text: reply.text, sources: reply.sources }].slice(-40));
      }
      setInput("");
    } catch (caught) {
      if (!mountedRef.current || controller.signal.aborted || abortRef.current !== controller) return;
      setError(submission ? caught instanceof ToshiChatApiError ? caught.message : new ToshiChatApiError().message : LOCAL_UNAVAILABLE);
      if (caught instanceof ToshiChatApiError && caught.code === "sensitive_input") setInput("");
      if (submission && (!(caught instanceof ToshiChatApiError) || caught.uncertain)) setRecovery(submission);
      else setRecovery(null);
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null; submissionRef.current = null; pendingRef.current = false;
        if (mountedRef.current) { setPending(false); setPendingQuestion(""); if (followLatest.current) composerRef.current?.focus({ preventScroll: true }); }
      }
    }
  }

  function stop() {
    const controller = abortRef.current;
    if (!controller) return;
    const submission = submissionRef.current;
    abortRef.current = null; submissionRef.current = null; controller.abort();
    pendingRef.current = false; setPending(false); setPendingQuestion("");
    if (submission) { setRecovery(submission); setError("Yanıt bekleme durduruldu. Son gönderimin sonucunu kontrol edin; sorunuz korundu."); }
    else setError("İstek durduruldu. Sorunuz korundu.");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const command = input.trim();
    if (pendingRef.current || loading || recovery || !command || command.length > 4000 || defaultProvider === undefined) return;
    const submission = aiMode ? Object.freeze({ operationId: crypto.randomUUID(), input: Object.freeze({ conversationId: conversation?.id ?? null, expectedVersion: conversation?.version ?? null, text: command }) }) : null;
    await send(submission, command);
  }

  function handleComposerKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  function closeHistory() {
    setHistoryOpen(false);
    historyButtonRef.current?.focus();
  }

  async function copyReply(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      if (mountedRef.current) setCopyStatus("Yanıt kopyalandı.");
    } catch {
      if (mountedRef.current) setCopyStatus("Kopyalanamadı. Metni seçerek kopyalayabilirsiniz.");
    }
  }

  function usePrompt(text: string) {
    if (disabled) return;
    setInput(text); composerRef.current?.focus();
  }

  return (
    <div className={styles.assistant} data-mode={mode} data-history-open={historyOpen} onKeyDown={(event) => { if (event.key === "Escape" && historyOpen) { event.preventDefault(); event.stopPropagation(); closeHistory(); } }}>
      {mode === "page" || historyOpen ? <aside id={`toshi-history-${mode}`} className={styles.historyPane} aria-label="Kayıtlı konuşmalar">
        <button className={styles.newConversation} type="button" onClick={newConversation} disabled={busy}><Plus aria-hidden="true" /><span>Yeni konuşma</span></button>
        <label className={styles.historySearch}><Search aria-hidden="true" /><span className={styles.srOnly}>Konuşmalarda ara</span><input ref={historySearchRef} type="search" value={historySearch} onChange={(event) => setHistorySearch(event.target.value)} placeholder="Konuşmalarda ara" disabled={busy} /></label>
        <div className={styles.historyList}>
          {matchingConversations.map((item) => <button key={item.id} type="button" className={styles.historyItem} aria-current={item.id === conversation?.id ? "true" : undefined} disabled={busy} onClick={() => void selectConversation(item.id)} title={item.title}><MessageSquare aria-hidden="true" /><span><strong>{item.title}</strong><small>{new Date(item.updatedAt).toLocaleDateString("tr-TR", { day: "numeric", month: "short" })}</small></span></button>)}
          {!loading && matchingConversations.length === 0 ? <p className={styles.historyEmpty}>{historySearch.trim() ? "Konuşma bulunamadı." : "Henüz kayıtlı konuşma yok."}</p> : null}
        </div>
        <small className={styles.historyLimit}>Son 20 konuşma</small>
      </aside> : null}
      <div className={styles.chatColumn}>
      <header className={styles.assistantHeader}>
        <div className={styles.assistantIdentity}><img src="/toshi/toshi-profile.webp" width={40} height={40} alt="" /><div><h2 id={`toshi-assistant-title-${mode}`} ref={titleRef} tabIndex={-1}>Toshi</h2><p>Mağaza asistanınız</p></div></div>
        <div className={styles.headerActions}>
          <button ref={historyButtonRef} type="button" className={styles.historyToggle} aria-label="Konuşma geçmişi" title="Konuşma geçmişi" aria-expanded={historyOpen} aria-controls={`toshi-history-${mode}`} disabled={busy} onClick={() => setHistoryOpen((current) => !current)}><History aria-hidden="true" /></button>
          <button type="button" className={styles.headerNewConversation} onClick={newConversation} disabled={busy} aria-label="Yeni konuşma" title="Yeni konuşma"><Plus aria-hidden="true" /><span className={styles.srOnly}>Yeni konuşma</span></button>
          {headerActions}
        </div>
      </header>
      <div className={styles.chatBody} inert={mode === "drawer" && historyOpen}>
      <div className={styles.connectionRow}>
        <details className={styles.connectionDetails}><summary aria-label="Bağlantı ve veri paylaşımı"><span className={styles.connectionDot} aria-hidden="true" /><span role="status">{providerStatus}</span><Info aria-hidden="true" /></summary><div className={styles.connectionInformation}><strong>{pin ? "Bu konuşmanın bağlantısı" : "Bağlantı"}</strong>{aiMode ? <p>Sorularınız ve yanıt için gereken mağaza verileri {pin ? PROVIDER_NAMES[pin.provider] : "bağlı sağlayıcı"} ile paylaşılır. Konuşma aynı sağlayıcı ve modelle devam eder.</p> : <p>{defaultProvider === null ? "Yerel mod yalnızca okuma ve güvenli gezinme işlemlerini destekler." : "Bağlantı bilgisi alınamadı. Geçmişi yenileyin."}</p>}<Link href="/settings/artificial-intelligence">Bağlantı ayarları<ArrowRight aria-hidden="true" /></Link></div></details>
        <span className={styles.readOnly}>Yalnızca okur</span>
      </div>
      <div ref={conversationElement} className={styles.conversation} aria-live="polite" aria-busy={pending || loading} onScroll={(event) => { const element = event.currentTarget; followLatest.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80; }}>
        {loading && entries.length === 0 ? <div className={styles.loadingState} role="status"><p>Konuşmalar yükleniyor…</p><span /><span /><span /></div> : entries.length === 0 && !pendingQuestion ? (
          <section className={styles.welcome} aria-labelledby={`toshi-welcome-${mode}`}>
            <ToshiWelcomeArtwork />
            <h3 id={`toshi-welcome-${mode}`}>Neye bakalım?</h3>
            <p>{aiMode ? "Mağazanızı özetleyin, ürünleri bulun, panelde yardım alın." : "Mağaza verilerine bakın, ilgili sayfalara geçin."}</p>
            <div className={styles.promptGrid}>
              <button type="button" disabled={disabled} onClick={() => usePrompt("Mağaza özeti")}><BarChart3 aria-hidden="true" /><span>Mağaza özeti</span><ArrowRight aria-hidden="true" /></button>
              <button type="button" disabled={disabled} onClick={() => usePrompt("Bekleyen siparişler")}><ShoppingBag aria-hidden="true" /><span>Bekleyen siparişler</span><ArrowRight aria-hidden="true" /></button>
              <button type="button" disabled={disabled} onClick={() => usePrompt("Ürün ara ")}><Search aria-hidden="true" /><span>Ürün veya SKU bul</span><ArrowRight aria-hidden="true" /></button>
              <button type="button" disabled={disabled} onClick={() => usePrompt("Ürünlere git")}><Package aria-hidden="true" /><span>Ürünlere git</span><ArrowRight aria-hidden="true" /></button>
            </div>
            <details className={styles.otherPrompts}><summary>Diğer sorular</summary><div><button type="button" disabled={disabled} onClick={() => usePrompt("Düşük stok")}>Stoğu tükenen ürünler</button><button type="button" disabled={disabled} onClick={() => usePrompt("Müşteri bul ")}>Müşteri bul</button><button type="button" disabled={disabled} onClick={() => usePrompt("Sipariş bul ")}>Sipariş bul</button></div></details>
            {defaultProvider === null && !conversation ? <p className={styles.localModeNote}>Yerel mod · yalnızca okuma ve gezinme</p> : null}
          </section>
        ) : (
          <ol className={styles.messages}>
            {entries.map((entry) => <li key={entry.id} className={entry.role === "user" ? styles.merchantMessage : styles.toshiMessage}>
              {entry.role === "user" ? <><span className={styles.srOnly}>Siz</span><p>{entry.text}</p></> : <><div className={styles.messageByline}><img src="/toshi/toshi-profile.webp" width={24} height={24} alt="" /><strong>Toshi</strong>{entry.createdAt ? <time dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}</time> : null}</div><ToshiMessageBody text={entry.text} /></>}
              {entry.sources && entry.sources.length > 0 ? <nav aria-label="Toshi yanıt kaynakları">{entry.sources.map((item) => <Link key={`${entry.id}-${item.href}`} href={item.href}>{item.label}<ArrowRight aria-hidden="true" /></Link>)}</nav> : null}
              {entry.role === "assistant" ? <button className={styles.copyReply} type="button" aria-label="Toshi yanıtını kopyala" onClick={() => void copyReply(entry.text)}><Copy aria-hidden="true" />Kopyala</button> : null}
            </li>)}
            {pendingQuestion ? <li className={styles.merchantMessage}><strong>Siz</strong><p>{pendingQuestion}</p></li> : null}
          </ol>
        )}
        {pending ? <div className={styles.pendingRow}><p className={styles.pendingStatus}>Toshi yanıtınızı hazırlıyor…</p><button type="button" onClick={stop}>Durdur</button></div> : null}
      </div>
      {error ? <div className={styles.errorState}><p role="alert">{error}</p>{recovery ? <button type="button" disabled={pending} onClick={() => void send(recovery, recovery.input.text)}>Yanıtı kontrol et</button> : <button type="button" disabled={pending || loading} onClick={() => void refresh("current")}>Geçmişi yenile</button>}</div> : null}
      <form className={styles.composer} onSubmit={submit}>
        <label className={styles.srOnly} htmlFor={`toshi-command-${mode}`}>Toshi’ye sorun</label>
        <div className={styles.composerField}><textarea ref={composerRef} id={`toshi-command-${mode}`} name="command" rows={1} value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={handleComposerKey} maxLength={4000} autoComplete="off" placeholder={aiMode ? "Toshi’ye sorun…" : "Örn. bekleyen siparişler"} disabled={disabled} aria-describedby={`toshi-composer-help-${mode}`} />
          <button type="submit" disabled={disabled || !input.trim()} aria-label="Soruyu Toshi’ye gönder"><SendHorizonal aria-hidden="true" /></button></div>
        <div className={styles.composerHelp}><span id={`toshi-composer-help-${mode}`}>{recovery ? "Devam etmek için son yanıtı kontrol edin." : "Enter gönderir · Shift + Enter yeni satır"}</span>{input.length >= 800 ? <span>{input.length.toLocaleString("tr-TR")} / 4.000</span> : null}</div>
      </form>
      <p className={styles.copyStatus} role="status">{copyStatus}</p>
      </div>
      </div>
    </div>
  );
}

function ToshiWelcomeArtwork() {
  return <svg className={styles.welcomeArtwork} viewBox="0 0 280 184" aria-hidden="true" focusable="false" fill="none" strokeLinecap="round" strokeLinejoin="round">
    <ellipse cx="144" cy="147" rx="112" ry="27" fill="var(--cp-art-soft)" />
    <path d="M47 112c-29-20-12-51 17-55 14-2 28 6 44 4 47-6 83-24 116 9 30 31 2 62-24 71H85Z" fill="var(--cp-art-peach)" />
    <rect x="75" y="35" width="132" height="104" rx="16" fill="var(--cp-surface)" stroke="var(--cp-art-outline)" /><path d="M75 61h132" stroke="var(--cp-art-outline)" />
    {[89, 99, 109].map((x) => <circle key={x} cx={x} cy="48" r="2" fill="var(--cp-art-outline)" />)}
    <rect x="94" y="77" width="76" height="25" rx="7" fill="var(--cp-art-muted)" /><path d="M119 100v8l9-8" fill="var(--cp-art-muted)" /><path d="M151 116h35m-15 9h15" stroke="var(--cp-art-outline)" />
    <path d="M219 45v15m-7-7h14" stroke="var(--cp-brand)" /><circle cx="234" cy="91" r="3" fill="var(--cp-art-outline)" /><circle cx="230" cy="103" r="2" fill="var(--cp-art-outline)" />
    <path d="M52 139c-1-24-15-35-22-36 0 17 6 30 22 36m0 0c1-31 15-43 25-44-1 22-10 36-25 44" fill="var(--cp-art-leaf)" /><path d="m41 137 4 20h16l4-20" fill="var(--cp-brand)" />
  </svg>;
}
