"use client";

import { Check, KeyRound, LoaderCircle, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

import type { ToshiProvider, ToshiProviderConnection } from "@celebix/saas-contracts";

import {
  ToshiProviderApiError,
  createToshiProviderApi,
} from "@/lib/toshi-provider-ui/client";

import styles from "./artificial-intelligence-settings.module.css";

const PROVIDERS = Object.freeze([
  Object.freeze({ provider: "openai" as const, label: "OpenAI", mark: "◎", tone: "openai" }),
  Object.freeze({ provider: "gemini" as const, label: "Google Gemini", mark: "✦", tone: "gemini" }),
  Object.freeze({ provider: "anthropic" as const, label: "Anthropic Claude", mark: "AI", tone: "anthropic" }),
]);

type Keys = Readonly<Record<ToshiProvider, string>>;
const EMPTY_KEYS: Keys = Object.freeze({ openai: "", gemini: "", anthropic: "" });

function message(error: unknown): string {
  return error instanceof ToshiProviderApiError ? error.message : "İşlem şu anda tamamlanamadı.";
}

function verifiedAt(value: string): string {
  try {
    return new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  } catch { return ""; }
}

export function ArtificialIntelligenceSettings({ canManage }: Readonly<{ canManage: boolean }>) {
  const api = useMemo(() => createToshiProviderApi(), []);
  const mounted = useRef(true);
  const activeRequest = useRef<AbortController | null>(null);
  const submissionActive = useRef(false);
  const [connections, setConnections] = useState<readonly ToshiProviderConnection[]>([]);
  const [keys, setKeys] = useState<Keys>(EMPTY_KEYS);
  const [pending, setPending] = useState<ToshiProvider | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");

  async function refresh(signal?: AbortSignal) {
    const items = await api.list(signal);
    if (mounted.current) setConnections(items);
  }

  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    activeRequest.current = controller;
    void refresh(controller.signal)
      .catch((error) => { if (mounted.current && !controller.signal.aborted) setNotice(message(error)); })
      .finally(() => { if (mounted.current) setLoading(false); });
    return () => {
      mounted.current = false;
      controller.abort();
      activeRequest.current?.abort();
    };
  }, [api]);

  async function run(provider: ToshiProvider, operation: (signal: AbortSignal) => Promise<unknown>, success: string) {
    if (submissionActive.current || !canManage) return;
    submissionActive.current = true;
    const controller = new AbortController();
    activeRequest.current = controller;
    setPending(provider);
    setNotice("");
    try {
      await operation(controller.signal);
      setKeys((current) => ({ ...current, [provider]: "" }));
      await refresh(controller.signal);
      if (mounted.current) setNotice(success);
    } catch (error) {
      if (mounted.current && !controller.signal.aborted) {
        setNotice(message(error));
        if (error instanceof ToshiProviderApiError && error.code === "version_conflict") {
          await refresh(controller.signal).catch(() => undefined);
        }
      }
    } finally {
      submissionActive.current = false;
      if (mounted.current) setPending(null);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>, provider: ToshiProvider, connection: ToshiProviderConnection | undefined) {
    event.preventDefault();
    const apiKey = keys[provider];
    if (apiKey.length === 0) return;
    void run(
      provider,
      (signal) => api.connect(provider, { apiKey, expectedVersion: connection?.version ?? 0 }, signal),
      connection ? "API anahtarı yenilendi." : "Sağlayıcı bağlandı.",
    );
  }

  return (
    <section className={styles.root} aria-labelledby="toshi-provider-settings-title">
      <div className={styles.sectionHeading}>
        <div>
          <h2 id="toshi-provider-settings-title">Model sağlayıcıları</h2>
          <span>{connections.length} bağlı</span>
        </div>
        <button
          type="button"
          className={styles.refreshButton}
          disabled={loading || pending !== null}
          onClick={() => {
            const controller = new AbortController();
            activeRequest.current = controller;
            setLoading(true);
            setNotice("");
            void refresh(controller.signal).catch((error) => setNotice(message(error))).finally(() => setLoading(false));
          }}
        >
          <RefreshCw aria-hidden="true" size={16} />
          Yenile
        </button>
      </div>

      <div className={styles.providerList} aria-busy={loading}>
        {PROVIDERS.map((entry) => {
          const connection = connections.find(({ provider }) => provider === entry.provider);
          const connected = connection?.status === "active";
          const busy = pending === entry.provider;
          return (
            <article className={styles.providerRow} key={entry.provider}>
              <div className={styles.identity}>
                <span className={`${styles.logo} ${styles[entry.tone]}`} aria-label={`${entry.label} logosu`} data-provider-logo={entry.provider}>
                  {entry.mark}
                </span>
                <div>
                  <strong>{entry.label}</strong>
                  <span className={connected ? styles.connected : styles.disconnected}>
                    {connected ? <Check aria-hidden="true" size={13} /> : null}
                    {connected ? "Bağlı" : "Bağlı değil"}
                  </span>
                </div>
              </div>

              <form className={styles.keyForm} onSubmit={(event) => submit(event, entry.provider, connection)}>
                <label htmlFor={`toshi-key-${entry.provider}`}>API anahtarı</label>
                <div className={styles.keyControl}>
                  <KeyRound aria-hidden="true" size={17} />
                  <input
                    id={`toshi-key-${entry.provider}`}
                    type="password"
                    autoComplete="new-password"
                    spellCheck={false}
                    disabled={!canManage || busy}
                    value={keys[entry.provider]}
                    placeholder={connected ? `${connection.maskedKey} · yeni anahtar` : "API anahtarını yapıştır"}
                    onChange={(event) => setKeys((current) => ({ ...current, [entry.provider]: event.target.value }))}
                  />
                  <button type="submit" disabled={!canManage || busy || keys[entry.provider].length === 0}>
                    {busy ? <LoaderCircle className={styles.spinner} aria-hidden="true" size={16} /> : null}
                    {connected ? "Yenile" : "Bağla"}
                  </button>
                </div>
              </form>

              <div className={styles.connectionControls}>
                {connected && connection ? (
                  <>
                    <label>
                      <span>Model</span>
                      <select
                        value={connection.selectedModel}
                        disabled={!canManage || busy}
                        onChange={(event) => {
                          const model = event.target.value;
                          void run(entry.provider, (signal) => api.selectModel(entry.provider, { model, expectedVersion: connection.version }, signal), "Model güncellendi.");
                        }}
                      >
                        {connection.availableModels.map((model) => <option key={model.id} value={model.id}>{model.label}</option>)}
                      </select>
                    </label>
                    <span className={styles.verified}>{verifiedAt(connection.verifiedAt)}</span>
                    {connection.isDefault ? (
                      <span className={styles.defaultStatus}><ShieldCheck aria-hidden="true" size={15} /> Varsayılan</span>
                    ) : (
                      <button
                        type="button"
                        className={styles.secondaryAction}
                        disabled={!canManage || busy}
                        onClick={() => void run(entry.provider, (signal) => api.setDefault(entry.provider, connection.version, signal), "Varsayılan sağlayıcı değiştirildi.")}
                      >
                        Varsayılan yap
                      </button>
                    )}
                    <button
                      type="button"
                      className={styles.removeAction}
                      disabled={!canManage || busy}
                      aria-label={`${entry.label} bağlantısını kaldır`}
                      onClick={() => {
                        if (!window.confirm(`${entry.label} bağlantısı kaldırılsın mı?`)) return;
                        void run(entry.provider, (signal) => api.revoke(entry.provider, connection.version, signal), "Bağlantı kaldırıldı.");
                      }}
                    >
                      <Trash2 aria-hidden="true" size={16} />
                    </button>
                  </>
                ) : <span className={styles.emptyControl}>—</span>}
              </div>
            </article>
          );
        })}
      </div>

      <p className={styles.liveStatus} aria-live="polite">{loading ? "Bağlantılar yükleniyor…" : notice}</p>
    </section>
  );
}
