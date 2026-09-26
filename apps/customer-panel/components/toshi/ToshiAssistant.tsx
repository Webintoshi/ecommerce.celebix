"use client";

import Link from "next/link";
import { ArrowRight, SendHorizonal } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import type { ToshiConversation, ToshiConversationSummary, ToshiSource } from "@celebix/saas-contracts";
import { createToshiChatApi, ToshiChatApiError, type ToshiSendInput } from "@/lib/toshi-chat-ui/client";
import { createToshiLocalClient } from "@/lib/toshi-local/client";
import { parseToshiLocalIntent } from "@/lib/toshi-local/intent";
import styles from "./toshi.module.css";

type ConversationEntry = Readonly<{ id: string; role: "user" | "assistant"; text: string; sources?: readonly ToshiSource[] }>;
type ProviderPin = Readonly<{ provider: ToshiConversationSummary["provider"]; model: string }>;
type Submission = Readonly<{ operationId: string; input: ToshiSendInput }>;
const PROVIDER_NAMES = Object.freeze({ openai: "OpenAI", gemini: "Google Gemini", anthropic: "Anthropic Claude", deepseek: "DeepSeek" });
const LOCAL_UNAVAILABLE = "Mağaza verilerine şu anda ulaşılamıyor. Sorunuz korundu; yeniden deneyin.";

export function ToshiAssistant({ mode }: Readonly<{ mode: "drawer" | "page" }>) {
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
  const abortRef = useRef<AbortController | null>(null);
  const loadRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(false);
  const pendingRef = useRef(false);
  const submissionRef = useRef<Submission | null>(null);
  const conversationRef = useRef<ToshiConversation | null>(null);
  const composerRef = useRef<HTMLInputElement>(null);
  const conversationElement = useRef<HTMLDivElement>(null);
  const followLatest = useRef(true);
  const pin = conversation ?? defaultProvider;
  const aiMode = pin !== null && pin !== undefined;
  const entries: readonly ConversationEntry[] = conversation?.messages ?? localEntries;

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

  async function selectConversation(id: string) {
    if (pendingRef.current || loading || recovery) return;
    if (!id) { newConversation(); return; }
    loadRef.current?.abort();
    const controller = new AbortController(); loadRef.current = controller;
    setLoading(true); setError("");
    try {
      const value = await api.get(id, controller.signal);
      if (mountedRef.current && !controller.signal.aborted && loadRef.current === controller) { acceptConversation(value); setInput(""); followLatest.current = true; }
    } catch (caught) {
      if (mountedRef.current && !controller.signal.aborted && loadRef.current === controller) setError(caught instanceof ToshiChatApiError && caught.code !== "unavailable" ? caught.message : "Konuşma yüklenemedi. Yeniden deneyin.");
    } finally { if (loadRef.current === controller) { loadRef.current = null; if (mountedRef.current) setLoading(false); } }
  }

  function newConversation() {
    if (pendingRef.current || loading || recovery) return;
    conversationRef.current = null; setConversation(null); setLocalEntries([]); setError(""); setInput("");
    followLatest.current = true;
    void refresh("new");
  }

  async function send(submission: Submission | null, command: string) {
    if (pendingRef.current || loading) return;
    pendingRef.current = true; setPending(true); setError(""); setPendingQuestion(command);
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
        if (mountedRef.current) { setPending(false); setPendingQuestion(""); composerRef.current?.focus(); }
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

  return (
    <div className={styles.assistant} data-mode={mode}>
      <div className={styles.conversationControls}>
        <p className={styles.providerStatus} role="status">{loading ? "Konuşmalar yükleniyor…" : pin ? `${PROVIDER_NAMES[pin.provider]} · ${pin.model}` : defaultProvider === null ? "Yerel mod" : "Bağlantı durumu alınamadı"}</p>
        <div>
          <label className={styles.srOnly} htmlFor={`toshi-history-${mode}`}>Kayıtlı konuşmalar</label>
          <select id={`toshi-history-${mode}`} aria-label="Kayıtlı konuşmalar" value={conversation?.id ?? ""} onChange={(event) => void selectConversation(event.target.value)} disabled={loading || pending || recovery !== null}>
            <option value="">Yeni konuşma</option>
            {conversations.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
          </select>
          <button type="button" onClick={newConversation} disabled={loading || pending || recovery !== null}>Yeni konuşma</button>
        </div>
        {aiMode ? <p className={styles.dataNotice}>Sorularınız ve yanıt için gereken mağaza verileri bağlı sağlayıcıya iletilir.</p> : null}
      </div>
      <div ref={conversationElement} className={styles.conversation} aria-live="polite" aria-busy={pending || loading} onScroll={(event) => { const element = event.currentTarget; followLatest.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80; }}>
        {entries.length === 0 && !pendingQuestion ? (
          <section className={styles.welcome} aria-labelledby={`toshi-welcome-${mode}`}>
            <h3 id={`toshi-welcome-${mode}`}>Mağazanız için hızlı yanıtlar</h3>
            <p>{aiMode ? "Mağazanız hakkında sorun, verilerinizi özetleyin veya panelde yardım alın." : "Toshi, mevcut güvenli mağaza verilerini okuyabilir ve sizi doğru alana götürebilir."}</p>
            <ul><li>Mağaza özeti</li><li>Bekleyen siparişler</li><li>Düşük stok</li><li>Müşteri bul &lt;ad&gt;</li><li>Ürün ara &lt;ad veya SKU&gt;</li><li>Sipariş bul &lt;numara&gt;</li><li>Ürünlere git</li></ul>
            {defaultProvider === null && !conversation ? <p className={styles.localModeNote}>Yerel mod yalnızca okuma ve güvenli gezinme işlemlerini destekler.</p> : null}
          </section>
        ) : (
          <ol className={styles.messages}>
            {entries.map((entry) => <li key={entry.id} className={entry.role === "user" ? styles.merchantMessage : styles.toshiMessage}>
              <strong>{entry.role === "user" ? "Siz" : "Toshi"}</strong><p>{entry.text}</p>
              {entry.sources && entry.sources.length > 0 ? <nav aria-label="Toshi yanıt kaynakları">{entry.sources.map((item) => <Link key={`${entry.id}-${item.href}`} href={item.href}>{item.label}<ArrowRight aria-hidden="true" /></Link>)}</nav> : null}
            </li>)}
            {pendingQuestion ? <li className={styles.merchantMessage}><strong>Siz</strong><p>{pendingQuestion}</p></li> : null}
          </ol>
        )}
        {pending ? <div className={styles.pendingRow}><p className={styles.pendingStatus}>Toshi yanıtınızı hazırlıyor…</p><button type="button" onClick={stop}>Durdur</button></div> : null}
      </div>
      {error ? <div className={styles.errorState}><p role="alert">{error}</p>{recovery ? <button type="button" disabled={pending} onClick={() => void send(recovery, recovery.input.text)}>Yanıtı kontrol et</button> : <button type="button" disabled={pending || loading} onClick={() => void refresh("current")}>Geçmişi yenile</button>}</div> : null}
      <form className={styles.composer} onSubmit={submit}>
        <label htmlFor={`toshi-command-${mode}`}>Toshi’ye sorun</label>
        <div><input ref={composerRef} id={`toshi-command-${mode}`} name="command" type="text" value={input} onChange={(event) => setInput(event.target.value)} maxLength={4000} autoComplete="off" placeholder={aiMode ? "Örn. mağazamı nasıl geliştirebilirim?" : "Örn. bekleyen siparişler"} disabled={pending || loading || recovery !== null || defaultProvider === undefined} />
          <button type="submit" disabled={pending || loading || recovery !== null || defaultProvider === undefined || !input.trim()} aria-label="Soruyu Toshi’ye gönder"><SendHorizonal aria-hidden="true" /></button></div>
      </form>
    </div>
  );
}
