"use client";
import { useEffect, useRef, useState } from "react";
import {
  PanelPageHeader,
  PanelPageShell,
} from "@/components/panel/PanelPageShell";
import styles from "./commerce-analytics-workspace.module.css";
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
    if (!settings) return;
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
        <PanelPageHeader
          title="Analitik ayarları"
          description="Ticaret analitiği ve sepet kurtarma eşikleri mağaza bazında yönetilir."
        />
        {state === "loading" ? (
          <div className={styles.loading} role="status">
            Ayarlar yükleniyor…
          </div>
        ) : null}
        {state === "error" ? (
          <div className={styles.warning} role="alert">
            {message}
          </div>
        ) : null}
        {state === "ready" && settings ? (
          <>
            <section
              className={
                connection?.configured && connection.status === "active"
                  ? styles.panel
                  : styles.warning
              }
              aria-label="Umami bağlantı durumu"
            >
              <strong>{connectionText}</strong>
              <p>
                Provider: self-hosted Umami · internal website ID ve erişim
                anahtarları gizlidir.
              </p>
              {!connection?.configured || connection.status !== "active" ? (
                <button
                  className={styles.primary}
                  type="button"
                  disabled={activating}
                  onClick={() => void enableAnalytics()}
                >
                  {activating ? "Etkinleştiriliyor…" : "Analitiği etkinleştir"}
                </button>
              ) : null}
            </section>
            <form className={styles.panel} onSubmit={submit}>
              <div className={styles.settingsGrid}>
                <label>
                  Terk adayı süresi <span>dakika, 15–360</span>
                  <input
                    name="candidateInactivityMinutes"
                    type="number"
                    min="15"
                    max="360"
                    defaultValue={settings.candidateInactivityMinutes}
                    required
                  />
                </label>
                <label>
                  Terk edilmiş süresi <span>saat, 1–168</span>
                  <input
                    name="abandonedInactivityHours"
                    type="number"
                    min="1"
                    max="168"
                    defaultValue={settings.abandonedInactivityHours}
                    required
                  />
                </label>
                <label>
                  Recovery link geçerliliği <span>saat, 1–168</span>
                  <input
                    name="recoveryLinkHours"
                    type="number"
                    min="1"
                    max="168"
                    defaultValue={settings.recoveryLinkHours}
                    required
                  />
                </label>
                <label>
                  Mesaj limiti <span>en fazla 3</span>
                  <input
                    name="maximumMessageAttempts"
                    type="number"
                    min="1"
                    max="3"
                    defaultValue={settings.maximumMessageAttempts}
                    required
                  />
                </label>
                <label>
                  Minimum mesaj aralığı <span>saat, en az 6</span>
                  <input
                    name="minimumMessageIntervalHours"
                    type="number"
                    min="6"
                    max="168"
                    defaultValue={settings.minimumMessageIntervalHours}
                    required
                  />
                </label>
                <label>
                  Tracking policy{" "}
                  <select
                    name="trackingPolicy"
                    defaultValue={settings.trackingPolicy}
                  >
                    <option value="anonymous_commerce">
                      Anonim ticaret analitiği
                    </option>
                    <option value="disabled">Kapalı</option>
                  </select>
                </label>
                <label>
                  Otomatik recovery{" "}
                  <input
                    type="checkbox"
                    checked={settings.automaticRecoveryEnabled}
                    disabled
                    readOnly
                  />
                  <span>
                    E-posta provider ve izin sertifikasyonu tamamlanana kadar
                    kapalıdır.
                  </span>
                </label>
                <label>
                  Session replay kapalı{" "}
                  <input type="checkbox" checked={false} disabled readOnly />
                  <span>
                    Checkout, ödeme, müşteri ve adres sayfalarında açılmaz.
                  </span>
                </label>
              </div>
              <button className={styles.primary} type="submit">
                Kaydet
              </button>
              {message ? <p role="status">{message}</p> : null}
            </form>
          </>
        ) : null}
      </div>
    </PanelPageShell>
  );
}
