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
  const mutationActive = useRef(false);
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
    if (!canManage || mutationActive.current) return;
    mutationActive.current = true;
    const controller = new AbortController();
    activeRequest.current = controller;
    setBusy(kind); setNotice("");
    try {
      const next = await operation(controller.signal);
      if (!mounted.current) return;
      hydrate(next);
      if (kind !== "resources") { setToken(""); setEditingToken(false); }
      setNotice(success);
    } catch (error) { if (mounted.current && !controller.signal.aborted) setNotice(message(error)); }
    finally { mutationActive.current = false; if (mounted.current) setBusy(null); }
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
  const resourceDirty = connection !== null && (
    brandId !== selectedId(workspace.resources, "brand", connection.selectedBrandLabel)
    || addressId !== selectedId(workspace.resources, "address", connection.selectedAddressLabel)
    || codDeliveredMarksPaid !== connection.codDeliveredMarksPaid
  );

  return (
    <section className={styles.page} data-panel-layout="open-canvas" data-settings-dirty={canManage && (resourceDirty || token.length > 0) ? "true" : undefined} aria-busy={loading || busy !== null}>
      <PanelTopbarBridge title="Kargo Ayarları" />
      <div className={styles.providerRow}>
        <div className={styles.identity}>
          <span className={styles.logo} aria-hidden="true"><Truck size={21} /></span>
          <div><strong>Basit Kargo</strong><span className={`${styles.status} ${styles[presentation.tone]}`}><i />{presentation.label}</span></div>
        </div>
        <div className={styles.actions}>
          <button type="button" className={styles.refresh} disabled={loading || busy !== null || resourceDirty} title={resourceDirty ? "Önce değişiklikleri kaydet veya vazgeç" : undefined} onClick={() => { const controller = new AbortController(); activeRequest.current = controller; setLoading(true); setNotice(""); void load(controller.signal).catch((error) => { if (!controller.signal.aborted) setNotice(message(error)); }).finally(() => setLoading(false)); }} aria-label="Kargo bağlantısını yenile"><RefreshCw size={16} /></button>
        </div>
      </div>

      {loading ? <p className={styles.loading} role="status">Yükleniyor…</p> : null}

      {!loading && connection && canChoose ? <form className={styles.resourceForm} onSubmit={(event) => {
        event.preventDefault();
        void run("resources", (signal) => shippingSettingsApi.selectResources({ brandResourceId: brandId, addressResourceId: addressId, codDeliveredMarksPaid }, signal), "Kargo ayarları kaydedildi.");
      }}>
        <div className={styles.formSection}>
          <div className={styles.sectionLabel}><h2>Gönderici</h2><p>Kargoların çıkış bilgileri.</p></div>
          <div className={styles.fields}>
            <label><span>Gönderici marka</span><select value={brandId} onChange={(event) => setBrandId(event.target.value)} disabled={!canManage || busy !== null}>{brands.map((resource) => <option key={resource.id} value={resource.id}>{resource.label}</option>)}</select></label>
            <label><span>Çıkış adresi</span><select value={addressId} onChange={(event) => setAddressId(event.target.value)} disabled={!canManage || busy !== null}>{addresses.map((resource) => <option key={resource.id} value={resource.id}>{resource.label}</option>)}</select></label>
          </div>
        </div>
        <div className={styles.formSection}>
          <div className={styles.sectionLabel}><h2>Kapıda ödeme</h2><p>Teslimat sonrası sipariş durumu.</p></div>
          <label className={styles.toggle}><input type="checkbox" checked={codDeliveredMarksPaid} onChange={(event) => setCodDeliveredMarksPaid(event.target.checked)} disabled={!canManage || busy !== null} /><span><b>Teslim edilince ödendi işaretle</b><small>Kapıda ödemeli siparişlere uygulanır.</small></span></label>
        </div>
        {canManage ? <div className={styles.saveRow}>{resourceDirty ? <button type="button" className={styles.secondary} disabled={busy !== null} onClick={() => { hydrate(workspace); setNotice(""); }}>Vazgeç</button> : null}<button className={styles.save} type="submit" disabled={busy !== null || !resourceDirty || !brandId || !addressId}>{busy === "resources" ? <LoaderCircle className={styles.spinner} size={16} /> : <Check size={16} />}Kaydet</button></div> : null}
      </form> : null}

      {!loading && canManage ? <section className={styles.formSection} aria-labelledby="shipping-connection-title">
        <div className={styles.sectionLabel}><h2 id="shipping-connection-title">Bağlantı</h2><p>Basit Kargo API anahtarı.</p></div>
        <div className={styles.connectionControls}>
          {connection ? <div className={styles.actions}>
            <button type="button" className={styles.secondary} disabled={busy !== null || resourceDirty} title={resourceDirty ? "Önce kargo ayarlarını kaydet veya vazgeç" : undefined} onClick={() => setEditingToken((value) => !value)} aria-label="Basit Kargo API anahtarını değiştir" aria-expanded={showToken}>Değiştir</button>
            <button type="button" className={styles.remove} disabled={busy !== null || resourceDirty} onClick={() => { if (window.confirm("Basit Kargo bağlantısı kaldırılsın mı?")) void run("revoke", (signal) => shippingSettingsApi.revoke(signal), "Bağlantı kaldırıldı."); }}><Trash2 size={15} />Bağlantıyı kaldır</button>
          </div> : null}
          {showToken ? <form className={styles.tokenForm} onSubmit={connect}>
            <label htmlFor="basit-kargo-token">API anahtarı</label>
            <div className={styles.tokenControl}>
              <KeyRound size={17} aria-hidden="true" />
              <input id="basit-kargo-token" type="password" autoComplete="new-password" spellCheck={false} value={token} onChange={(event) => setToken(event.target.value)} placeholder="Basit Kargo API anahtarını yapıştır" disabled={busy !== null} />
            </div>
            <button className={styles.save} type="submit" disabled={busy !== null || resourceDirty || token.length < 16}>{busy === "connect" ? <LoaderCircle className={styles.spinner} size={16} /> : null}{connection ? "Kaydet" : "Bağla"}</button>
          </form> : null}
        </div>
      </section> : null}

      {!loading && connection?.status === "pending" && !canChoose ? <p className={styles.inlineState}><ShieldCheck size={16} />Bağlantı doğrulanıyor.</p> : null}
      <p className={styles.liveStatus} aria-live="polite">{notice}</p>
    </section>
  );
}
