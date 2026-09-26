"use client";
import { useEffect, useRef, useState } from "react";
import {
  PanelPageHeader,
  PanelPageShell,
} from "@/components/panel/PanelPageShell";
import styles from "./analytics-settings-console.module.css";
type Connection = Readonly<{
  provider: "umami";
  status: "pending" | "active" | "disabled" | "failed";
  configured: boolean;
  live: boolean;
}>;
type Settings = Readonly<{
  candidateInactivityMinutes: number;
  abandonedInactivityHours: number;
  recoveryLinkHours: number;
  automaticRecoveryEnabled: boolean;
  maximumMessageAttempts: number;
  minimumMessageIntervalHours: number;
  trackingPolicy: "disabled" | "anonymous_commerce";
  version: number;
}>;
type Result = Readonly<{ settings: Settings; connection: Connection }>;
const ENDPOINT = "/api/analytics/settings";
const CONNECTION_ENDPOINT = "/api/analytics/connection";
function readSettings(value: unknown): Result {
  if (!value || typeof value !== "object") throw Error("invalid_response");
  const envelope = value as Record<string, unknown>,
    input = envelope.settings as Record<string, unknown>,
    rawConnection = envelope.connection as Record<string, unknown>;
  if (!input || !rawConnection) throw Error("invalid_response");
  const number = (key: string, min: number, max: number) => {
    const selected = input[key];
    if (
      !Number.isSafeInteger(selected) ||
      Number(selected) < min ||
      Number(selected) > max
    )
      throw Error("invalid_response");
    return Number(selected);
  };
  const trackingPolicy = input.trackingPolicy;
  if (trackingPolicy !== "disabled" && trackingPolicy !== "anonymous_commerce")
    throw Error("invalid_response");
  if (
    typeof input.automaticRecoveryEnabled !== "boolean" ||
    rawConnection.provider !== "umami" ||
    typeof rawConnection.configured !== "boolean" ||
    typeof rawConnection.live !== "boolean" ||
    !["pending", "active", "disabled", "failed"].includes(
      String(rawConnection.status),
    )
  )
    throw Error("invalid_response");
  return Object.freeze({
    settings: Object.freeze({
      candidateInactivityMinutes: number("candidateInactivityMinutes", 15, 360),
      abandonedInactivityHours: number("abandonedInactivityHours", 1, 168),
      recoveryLinkHours: number("recoveryLinkHours", 1, 168),
      automaticRecoveryEnabled: input.automaticRecoveryEnabled,
      maximumMessageAttempts: number("maximumMessageAttempts", 1, 3),
      minimumMessageIntervalHours: number(
        "minimumMessageIntervalHours",
        6,
        168,
      ),
      trackingPolicy,
      version: number("version", 1, Number.MAX_SAFE_INTEGER),
    }),
    connection: Object.freeze({
      provider: "umami",
      status: rawConnection.status as Connection["status"],
      configured: rawConnection.configured,
      live: rawConnection.live,
    }),
  });
}
export function AnalyticsSettingsConsole() {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading"),
    [settings, setSettings] = useState<Settings>(),
    [connection, setConnection] = useState<Connection>(),
    [message, setMessage] = useState(""),
    [activating, setActivating] = useState(false),
    [saving, setSaving] = useState(false),
    activeSave = useRef(false),
    activationOperation = useRef<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(ENDPOINT, {
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw Error("request_failed");
        return readSettings(await response.json());
      })
      .then((value) => {
        if (!controller.signal.aborted) {
          setSettings(value.settings);
          setConnection(value.connection);
          setState("ready");
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setMessage("Analitik ayarları yüklenemedi.");
          setState("error");
        }
      });
    return () => controller.abort();
  }, []);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!settings || activeSave.current) return;
    activeSave.current = true;
    setSaving(true);
    setMessage("Kaydediliyor…");
    const form = new FormData(event.currentTarget),
      payload = {
        expectedVersion: settings.version,
        candidateInactivityMinutes: Number(
          form.get("candidateInactivityMinutes"),
        ),
        abandonedInactivityHours: Number(form.get("abandonedInactivityHours")),
        recoveryLinkHours: Number(form.get("recoveryLinkHours")),
        automaticRecoveryEnabled: false,
        maximumMessageAttempts: Number(form.get("maximumMessageAttempts")),
        minimumMessageIntervalHours: Number(
          form.get("minimumMessageIntervalHours"),
        ),
        trackingPolicy: String(form.get("trackingPolicy")),
      };
    try {
      const response = await fetch(ENDPOINT, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw Error("request_failed");
      const value = readSettings({ ...(await response.json()), connection });
      setSettings(value.settings);
      setMessage("Analitik ayarları kaydedildi.");
    } catch {
      setMessage("Ayarlar kaydedilemedi. Güncel değerleri yeniden yükleyin.");
    } finally {
      activeSave.current = false;
      setSaving(false);
    }
  }
  async function enableAnalytics() {
    if (activating) return;
    const operationId = activationOperation.current ?? crypto.randomUUID();
    activationOperation.current = operationId;
    setActivating(true);
    setMessage("Analitik bağlantısı etkinleştiriliyor…");
    try {
      const response = await fetch(CONNECTION_ENDPOINT, {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: {
          "content-type": "application/json",
          "idempotency-key": operationId,
        },
        body: JSON.stringify({ intent: "enable" }),
      });
      if (!response.ok) throw Error("request_failed");
      const refreshed = await fetch(ENDPOINT, {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!refreshed.ok) throw Error("request_failed");
      const value = readSettings(await refreshed.json());
      setSettings(value.settings);
      setConnection(value.connection);
      activationOperation.current = null;
      setMessage("Analitik bağlantısı etkinleştirildi.");
    } catch {
      setMessage("Analitik bağlantısı etkinleştirilemedi. Yeniden deneyin.");
    } finally {
      setActivating(false);
    }
  }
  const connectionText =
    connection?.configured && connection.status === "active" && connection.live
      ? "Analizler etkin · Veri toplanıyor"
      : (connection?.configured &&
            connection.status === "active" &&
            !connection.live) ||
          connection?.status === "failed"
        ? "Trafik servisine ulaşılamıyor · Sipariş verileri kullanılabilir"
        : "Kurulum bekleniyor · Sipariş verileri kullanılabilir";
  return (
    <PanelPageShell>
      <div className={styles.root}>
        <PanelPageHeader title="Analitik ayarları" />
        {state === "loading" ? (
          <p className={styles.loading} role="status">Ayarlar yükleniyor…</p>
        ) : null}
        {state === "error" ? (
          <div className={styles.error} role="alert">
            <p>{message}</p>
            <button className={styles.secondary} type="button" onClick={() => window.location.reload()}>Tekrar dene</button>
          </div>
        ) : null}
        {state === "ready" && settings ? (
          <>
            <section className={styles.connection} aria-label="Umami bağlantı durumu">
              <div>
                <strong className={styles.connectionStatus}>
                  <i className={connection?.configured && connection.status === "active" && connection.live ? styles.activeDot : styles.pendingDot} aria-hidden="true" />
                  {connectionText}
                </strong>
              </div>
              {!connection?.configured || connection.status !== "active" ? (
                <button className={styles.secondary} type="button" disabled={activating} onClick={() => void enableAnalytics()}>
                  {activating ? "Etkinleştiriliyor…" : "Analitiği etkinleştir"}
                </button>
              ) : null}
            </section>
            <form className={styles.form} onSubmit={submit}>
              <section className={styles.formSection} aria-labelledby="analytics-tracking-title">
                <div className={styles.sectionLabel}><h2 id="analytics-tracking-title">Takip</h2><p>Mağaza analitiği.</p></div>
                <fieldset className={styles.settingsGrid} disabled={saving} aria-labelledby="analytics-tracking-title">
                  <label className={styles.wide}>
                    Takip tercihi
                    <select name="trackingPolicy" defaultValue={settings.trackingPolicy}>
                      <option value="anonymous_commerce">Anonim ticaret analitiği</option>
                      <option value="disabled">Kapalı</option>
                    </select>
                  </label>
                  <label className={styles.switchRow}>
                    <span><strong>Oturum kaydı</strong><small>Checkout, ödeme, müşteri ve adres sayfalarında kapalıdır.</small></span>
                    <input type="checkbox" checked={false} disabled readOnly />
                  </label>
                </fieldset>
              </section>
              <section className={styles.formSection} aria-labelledby="analytics-carts-title">
                <div className={styles.sectionLabel}><h2 id="analytics-carts-title">Sepet süreleri</h2><p>Sepet değerlendirme eşikleri.</p></div>
                <fieldset className={styles.settingsGrid} disabled={saving} aria-labelledby="analytics-carts-title">
                  <label>
                    Terk adayı süresi
                    <input name="candidateInactivityMinutes" type="number" min="15" max="360" defaultValue={settings.candidateInactivityMinutes} required />
                    <small>15–360 dakika</small>
                  </label>
                  <label>
                    Terk edilmiş süresi
                    <input name="abandonedInactivityHours" type="number" min="1" max="168" defaultValue={settings.abandonedInactivityHours} required />
                    <small>1–168 saat</small>
                  </label>
                  <label>
                    Kurtarma bağlantısı
                    <input name="recoveryLinkHours" type="number" min="1" max="168" defaultValue={settings.recoveryLinkHours} required />
                    <small>Geçerlilik · 1–168 saat</small>
                  </label>
                </fieldset>
              </section>
              <section className={styles.formSection} aria-labelledby="analytics-recovery-title">
                <div className={styles.sectionLabel}><h2 id="analytics-recovery-title">Kurtarma</h2><p>Mesaj sıklığı ve sınırı.</p></div>
                <fieldset className={styles.settingsGrid} disabled={saving} aria-labelledby="analytics-recovery-title">
                  <label>
                    Mesaj limiti
                    <input name="maximumMessageAttempts" type="number" min="1" max="3" defaultValue={settings.maximumMessageAttempts} required />
                    <small>En fazla 3</small>
                  </label>
                  <label>
                    Minimum mesaj aralığı
                    <input name="minimumMessageIntervalHours" type="number" min="6" max="168" defaultValue={settings.minimumMessageIntervalHours} required />
                    <small>6–168 saat</small>
                  </label>
                  <label className={styles.switchRow}>
                    <span><strong>Otomatik sepet kurtarma</strong><small>E-posta bağlantısı ve izin doğrulaması tamamlanana kadar kapalıdır.</small></span>
                    <input type="checkbox" checked={settings.automaticRecoveryEnabled} disabled readOnly />
                  </label>
                </fieldset>
              </section>
              <footer className={styles.savebar}>
                {message ? <p role="status">{message}</p> : <span />}
                <button className={styles.primary} type="submit" disabled={saving}>{saving ? "Kaydediliyor…" : "Kaydet"}</button>
              </footer>
            </form>
          </>
        ) : null}
      </div>
    </PanelPageShell>
  );
}
