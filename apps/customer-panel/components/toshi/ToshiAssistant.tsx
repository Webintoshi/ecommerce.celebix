"use client";

import Link from "next/link";
import { ArrowRight, SendHorizonal } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";

import { createToshiLocalClient } from "@/lib/toshi-local/client";
import { parseToshiLocalIntent } from "@/lib/toshi-local/intent";
import type { ToshiLocalSource } from "@/lib/toshi-local/types";

import styles from "./toshi.module.css";

type ConversationEntry = Readonly<{
  id: string;
  role: "merchant" | "toshi";
  text: string;
  sources?: readonly ToshiLocalSource[];
}>;

const UNAVAILABLE_REPLY = "Mağaza verilerine şu anda güvenli şekilde ulaşamıyorum. Lütfen tekrar deneyin.";

export function ToshiAssistant({ mode }: Readonly<{ mode: "drawer" | "page" }>) {
  const [client] = useState(() => createToshiLocalClient());
  const [entries, setEntries] = useState<readonly ConversationEntry[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(false);
  const pendingRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const command = input;
    if (pendingRef.current || command.trim().length === 0) return;

    pendingRef.current = true;
    setPending(true);
    setInput("");
    setEntries((current) => [
      ...current,
      { id: crypto.randomUUID(), role: "merchant", text: command },
    ]);

    const controller = new AbortController();
    abortRef.current = controller;
    const intent = parseToshiLocalIntent(command);

    try {
      const reply = await client.execute(intent, controller.signal);
      if (!mountedRef.current) return;
      setEntries((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "toshi",
          text: reply.text,
          sources: reply.sources,
        },
      ]);
    } catch (error) {
      if (!mountedRef.current || (error instanceof DOMException && error.name === "AbortError")) return;
      setEntries((current) => [
        ...current,
        { id: crypto.randomUUID(), role: "toshi", text: UNAVAILABLE_REPLY },
      ]);
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      pendingRef.current = false;
      if (mountedRef.current) setPending(false);
    }
  }

  return (
    <div className={styles.assistant} data-mode={mode}>
      <div className={styles.conversation} aria-live="polite" aria-busy={pending}>
        {entries.length === 0 ? (
          <section className={styles.welcome} aria-labelledby={`toshi-welcome-${mode}`}>
            <h3 id={`toshi-welcome-${mode}`}>Mağazanız için hızlı yanıtlar</h3>
            <p>Toshi, mevcut güvenli mağaza verilerini okuyabilir ve sizi doğru alana götürebilir.</p>
            <ul>
              <li>Mağaza özeti</li>
              <li>Bekleyen siparişler</li>
              <li>Düşük stok</li>
              <li>Müşteri bul &lt;ad&gt;</li>
              <li>Ürün ara &lt;ad veya SKU&gt;</li>
              <li>Sipariş bul &lt;numara&gt;</li>
              <li>Ürünlere git</li>
            </ul>
            <p className={styles.localModeNote}>Yerel mod yalnızca okuma ve güvenli gezinme işlemlerini destekler.</p>
          </section>
        ) : (
          <ol className={styles.messages}>
            {entries.map((entry) => (
              <li key={entry.id} className={entry.role === "merchant" ? styles.merchantMessage : styles.toshiMessage}>
                <strong>{entry.role === "merchant" ? "Siz" : "Toshi"}</strong>
                <p>{entry.text}</p>
                {entry.sources && entry.sources.length > 0 ? (
                  <nav aria-label="Toshi yanıt kaynakları">
                    {entry.sources.map((item) => (
                      <Link key={`${entry.id}-${item.href}`} href={item.href}>
                        {item.label}<ArrowRight aria-hidden="true" />
                      </Link>
                    ))}
                  </nav>
                ) : null}
              </li>
            ))}
          </ol>
        )}
        {pending ? <p className={styles.pendingStatus}>Toshi mağaza verilerini kontrol ediyor…</p> : null}
      </div>

      <form className={styles.composer} onSubmit={submit}>
        <label htmlFor={`toshi-command-${mode}`}>Toshi’ye sorun</label>
        <div>
          <input
            id={`toshi-command-${mode}`}
            name="command"
            type="text"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            maxLength={500}
            autoComplete="off"
            placeholder="Örn. bekleyen siparişler"
            disabled={pending}
          />
          <button type="submit" disabled={pending} aria-label="Soruyu Toshi’ye gönder">
            <SendHorizonal aria-hidden="true" />
          </button>
        </div>
      </form>
    </div>
  );
}
