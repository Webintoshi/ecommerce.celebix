"use client";

import { Check, KeyRound, LoaderCircle, RefreshCw, ShieldCheck, Trash2, Truck } from "lucide-react";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

import type { ShippingResource } from "@celebix/saas-contracts";

import { PanelTopbarBridge } from "@/components/panel/PanelTopbarChrome";
import {
  ShippingSettingsApiError,
  shippingSettingsApi,
  type ShippingSettingsWorkspace,
} from "@/lib/shipping-ui/client";

import styles from "./shipping-settings.module.css";

const EMPTY: ShippingSettingsWorkspace = Object.freeze({ connection: null, resources: Object.freeze([]) });

function message(error: unknown): string {
  return error instanceof ShippingSettingsApiError ? error.message : "İşlem tamamlanamadı.";
}

function status(value: ShippingSettingsWorkspace["connection"]): Readonly<{ label: string; tone: string }> {
  if (value?.status === "active") return Object.freeze({ label: "Bağlı", tone: "success" });
  if (value?.status === "pending") return Object.freeze({ label: "Kurulum bekliyor", tone: "pending" });
  if (value?.status === "attention_required") return Object.freeze({ label: "Kontrol gerekli", tone: "warning" });
  return Object.freeze({ label: "Bağlı değil", tone: "neutral" });
}

function active(resources: readonly ShippingResource[], kind: "brand" | "address") {
  return resources.filter((resource) => resource.kind === kind && resource.active);
}

function selectedId(resources: readonly ShippingResource[], kind: "brand" | "address", label?: string): string {
  const candidates = active(resources, kind);
  return candidates.find((resource) => resource.label === label)?.id ?? candidates[0]?.id ?? "";
}

export function ShippingSettingsConsole({ canManage }: Readonly<{ canManage: boolean }>) {
  const mounted = useRef(true);
  const activeRequest = useRef<AbortController | null>(null);
  const [workspace, setWorkspace] = useState<ShippingSettingsWorkspace>(EMPTY);
  const [token, setToken] = useState("");
  const [editingToken, setEditingToken] = useState(false);
  const [brandId, setBrandId] = useState("");
  const [addressId, setAddressId] = useState("");
  const [codDeliveredMarksPaid, setCodDeliveredMarksPaid] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"connect" | "resources" | "revoke" | null>(null);
  const [notice, setNotice] = useState("");

  const hydrate = useCallback((next: ShippingSettingsWorkspace) => {
    if (!mounted.current) return;
    setWorkspace(next);
    setBrandId(selectedId(next.resources, "brand", next.connection?.selectedBrandLabel));
    setAddressId(selectedId(next.resources, "address", next.connection?.selectedAddressLabel));
    setCodDeliveredMarksPaid(next.connection?.codDeliveredMarksPaid ?? false);
  }, []);

  const load = useCallback(async (signal?: AbortSignal) => {
    const next = await shippingSettingsApi.current(signal);
    hydrate(next);
  }, [hydrate]);

  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    activeRequest.current = controller;
    void load(controller.signal).catch((error) => { if (mounted.current && !controller.signal.aborted) setNotice(message(error)); }).finally(() => { if (mounted.current) setLoading(false); });
    return () => { mounted.current = false; controller.abort(); activeRequest.current?.abort(); };
  }, [load]);

  async function run(kind: "connect" | "resources" | "revoke", operation: (signal: AbortSignal) => Promise<ShippingSettingsWorkspace>, success: string) {
    if (!canManage || busy !== null) return;
    const controller = new AbortController();
    activeRequest.current = controller;
    setBusy(kind); setNotice("");
    try {
      const next = await operation(controller.signal);
      hydrate(next);
      setToken(""); setEditingToken(false); setNotice(success);
    } catch (error) { if (mounted.current && !controller.signal.aborted) setNotice(message(error)); }
    finally { if (mounted.current) setBusy(null); }
  }

  function connect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (token.length < 16) return;
    void run("connect", (signal) => shippingSettingsApi.saveConnection(token, signal), workspace.connection ? "API anahtarı değiştirildi." : "Basit Kargo doğrulandı.");
  }

  const connection = workspace.connection?.status === "revoked" ? null : workspace.connection;
  const presentation = status(connection);
  const brands = active(workspace.resources, "brand");
  const addresses = active(workspace.resources, "address");
  const canChoose = brands.length > 0 && addresses.length > 0;
  const showToken = connection === null || editingToken || connection.status === "attention_required";

  return (
    <section className={styles.page} data-panel-layout="open-canvas" aria-busy={loading || busy !== null}>
      <PanelTopbarBridge title="Kargo Ayarları" />
      <div className={styles.providerRow}>
        <div className={styles.identity}>
          <span className={styles.logo} aria-hidden="true"><Truck size={21} /></span>
          <div><strong>Basit Kargo</strong><span className={`${styles.status} ${styles[presentation.tone]}`}><i />{presentation.label}</span></div>
        </div>
        <div className={styles.actions}>
          <button type="button" className={styles.refresh} disabled={loading || busy !== null} onClick={() => { const controller = new AbortController(); activeRequest.current = controller; setLoading(true); setNotice(""); void load(controller.signal).catch((error) => { if (!controller.signal.aborted) setNotice(message(error)); }).finally(() => setLoading(false)); }} aria-label="Kargo bağlantısını yenile"><RefreshCw size={16} /></button>
          {connection && canManage ? <button type="button" className={styles.secondary} disabled={busy !== null} onClick={() => setEditingToken((value) => !value)}>Değiştir</button> : null}
          {connection && canManage ? <button type="button" className={styles.remove} disabled={busy !== null} onClick={() => { if (window.confirm("Basit Kargo bağlantısı kaldırılsın mı?")) void run("revoke", (signal) => shippingSettingsApi.revoke(signal), "Bağlantı kaldırıldı."); }}><Trash2 size={15} />Bağlantıyı kaldır</button> : null}
        </div>
      </div>

      {loading ? <p className={styles.loading} role="status">Yükleniyor…</p> : null}

      {!loading && showToken && canManage ? <form className={styles.tokenForm} onSubmit={connect}>
        <label htmlFor="basit-kargo-token">API anahtarı</label>
        <div className={styles.tokenControl}>
          <KeyRound size={17} aria-hidden="true" />
          <input id="basit-kargo-token" type="password" autoComplete="new-password" spellCheck={false} value={token} onChange={(event) => setToken(event.target.value)} placeholder="Basit Kargo API anahtarını yapıştır" disabled={busy !== null} />
          <button type="submit" disabled={busy !== null || token.length < 16}>{busy === "connect" ? <LoaderCircle className={styles.spinner} size={16} /> : null}{connection ? "Kaydet" : "Bağla"}</button>
        </div>
      </form> : null}

      {!loading && connection && canChoose ? <form className={styles.resourceForm} onSubmit={(event) => {
        event.preventDefault();
        void run("resources", (signal) => shippingSettingsApi.selectResources({ brandResourceId: brandId, addressResourceId: addressId, codDeliveredMarksPaid }, signal), "Kargo ayarları kaydedildi.");
      }}>
        <label><span>Gönderici marka</span><select value={brandId} onChange={(event) => setBrandId(event.target.value)} disabled={!canManage || busy !== null}>{brands.map((resource) => <option key={resource.id} value={resource.id}>{resource.label}</option>)}</select></label>
        <label><span>Çıkış adresi</span><select value={addressId} onChange={(event) => setAddressId(event.target.value)} disabled={!canManage || busy !== null}>{addresses.map((resource) => <option key={resource.id} value={resource.id}>{resource.label}</option>)}</select></label>
        <label className={styles.toggle}><input type="checkbox" checked={codDeliveredMarksPaid} onChange={(event) => setCodDeliveredMarksPaid(event.target.checked)} disabled={!canManage || busy !== null} /><span><b>Kapıda ödeme</b><small>Teslim edilince ödendi işaretle</small></span></label>
        {canManage ? <button className={styles.save} type="submit" disabled={busy !== null || !brandId || !addressId}>{busy === "resources" ? <LoaderCircle className={styles.spinner} size={16} /> : <Check size={16} />}Kaydet</button> : null}
      </form> : null}

      {!loading && connection?.status === "pending" && !canChoose ? <p className={styles.inlineState}><ShieldCheck size={16} />Bağlantı doğrulanıyor.</p> : null}
      <p className={styles.liveStatus} aria-live="polite">{notice}</p>
    </section>
  );
}
