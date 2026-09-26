"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Barcode, Box, ExternalLink, Printer, RefreshCw, RotateCcw, Truck } from "lucide-react";
import type { Shipment, ShippingPackage, ShippingQuoteSession } from "@celebix/saas-contracts";

import { OrderActionDialog } from "@/components/orders/OrderActionDialog";
import { ShippingFulfillmentApiError, shippingFulfillmentApi } from "@/lib/shipping-ui/client";
import styles from "./order-shipment.module.css";

type BusyState = "" | "quote" | "shipment" | "refresh" | "label" | "cancel" | "return";
type PackageField = keyof ShippingPackage;
type PackageValues = Readonly<Record<PackageField, string>>;
const DEFAULT_PACKAGE: PackageValues = Object.freeze({ widthCm: "20", depthCm: "20", heightCm: "10", weightKg: "1" });
const PACKAGE_FIELDS = Object.freeze([
  ["widthCm", "En", "cm"], ["depthCm", "Boy", "cm"], ["heightCm", "Yükseklik", "cm"], ["weightKg", "Ağırlık", "kg"],
] as const);

function money(cents: number) {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(cents / 100);
}

function value(data: FormData, name: string): number {
  const selected = Number(data.get(name));
  if (!Number.isFinite(selected) || selected < 0.001 || selected > 10_000) throw new ShippingFulfillmentApiError("invalid_input", 400);
  return selected;
}

function packageFrom(data: FormData): ShippingPackage {
  return Object.freeze({ heightCm: value(data, "heightCm"), widthCm: value(data, "widthCm"), depthCm: value(data, "depthCm"), weightKg: value(data, "weightKg") });
}

function safeMessage(error: unknown): string {
  return error instanceof ShippingFulfillmentApiError ? error.message : "Kargo işlemi şu anda tamamlanamadı.";
}

function shipmentStatus(status: Shipment["status"]): string {
  if (status === "ready") return "Hazır";
  if (status === "shipped") return "Kargoda";
  if (status === "out_for_delivery") return "Dağıtımda";
  if (status === "delivered") return "Teslim edildi";
  if (status === "delayed") return "Gecikme var";
  if (status === "returning") return "İade sürecinde";
  if (status === "returned") return "İade edildi";
  if (status === "lost") return "Kayıp";
  if (status === "cancelled") return "İptal edildi";
  if (status === "provider_outcome_unknown") return "Sonuç doğrulanıyor";
  if (status === "attention_required") return "İnceleme gerekiyor";
  return "İşleniyor";
}

export function OrderShipmentConsole({ orderId, orderVersion }: Readonly<{ orderId: string; orderVersion: number }>) {
  const scope = `${orderId}:${orderVersion}`;
  const latestScope = useRef(scope);
  latestScope.current = scope;
  const lastOrderId = useRef(orderId);
  const formId = useId();
  const [packageValues, setPackageValues] = useState<PackageValues>(DEFAULT_PACKAGE);
  const [open, setOpen] = useState(false);
  const [quote, setQuote] = useState<ShippingQuoteSession | null>(null);
  const quoteScope = useRef<string | null>(null);
  const [shipment, setShipment] = useState<Shipment | null | undefined>(undefined);
  const [loadedScope, setLoadedScope] = useState("");
  const [loadError, setLoadError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [selectedOptionId, setSelectedOptionId] = useState("");
  const [busy, setBusy] = useState<BusyState>("");
  const [message, setMessage] = useState("");
  const controller = useRef<AbortController | null>(null);
  const inFlight = useRef<BusyState>("");
  const currentShipment = loadedScope === scope ? shipment : undefined;
  const usableQuote = quote?.status === "quoted" && quoteScope.current === scope;

  useEffect(() => {
    const load = new AbortController();
    controller.current?.abort();
    inFlight.current = "";
    setBusy("");
    setShipment(undefined);
    setLoadedScope("");
    setLoadError("");
    setMessage("");
    setQuote(null);
    quoteScope.current = null;
    setSelectedOptionId("");
    if (lastOrderId.current !== orderId) {
      lastOrderId.current = orderId;
      setPackageValues(DEFAULT_PACKAGE);
      setOpen(false);
    }
    void shippingFulfillmentApi.currentShipmentForOrder(orderId, load.signal).then((current) => {
      if (load.signal.aborted || latestScope.current !== scope) return;
      setShipment(current);
      setLoadedScope(scope);
    }).catch((error: unknown) => {
      if (!load.signal.aborted && latestScope.current === scope) setLoadError(safeMessage(error));
    });
    return () => { load.abort(); inFlight.current = ""; controller.current?.abort(); };
  }, [orderId, orderVersion, scope, loadAttempt]);

  useEffect(() => {
    if (!quote || quoteScope.current !== scope) return;
    const expire = () => {
      setQuote(null);
      quoteScope.current = null;
      setSelectedOptionId("");
      setMessage("Kargo teklifi sona erdi; yeniden fiyat alın.");
    };
    const remaining = Date.parse(quote.expiresAt) - Date.now();
    if (quote.status !== "quoted" || !Number.isFinite(remaining) || remaining <= 0) { expire(); return; }
    const timer = window.setTimeout(expire, Math.min(remaining, 2_147_483_647));
    return () => window.clearTimeout(timer);
  }, [quote, scope]);

  function begin(next: Exclude<BusyState, "">) {
    if (inFlight.current !== "" || loadedScope !== scope) return null;
    controller.current = new AbortController();
    inFlight.current = next;
    setBusy(next);
    setMessage("");
    return controller.current.signal;
  }

  function finish(signal: AbortSignal) {
    if (!signal.aborted && controller.current?.signal === signal && latestScope.current === scope) {
      inFlight.current = "";
      setBusy("");
    }
  }

  function changePackage(name: PackageField, next: string) {
    setPackageValues((current) => ({ ...current, [name]: next }));
    setQuote(null);
    quoteScope.current = null;
    setSelectedOptionId("");
  }

  async function requestQuote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (currentShipment !== null) return;
    const data = new FormData(event.currentTarget);
    const signal = begin("quote");
    if (signal === null) return;
    setQuote(null);
    quoteScope.current = null;
    setSelectedOptionId("");
    try {
      const next = await shippingFulfillmentApi.quote(orderId, orderVersion, [packageFrom(data)], signal);
      if (signal.aborted || latestScope.current !== scope) return;
      quoteScope.current = scope;
      setQuote(next);
      setSelectedOptionId(next.options[0]?.id ?? "");
      if (next.options.length === 0) setMessage("Uygun kargo teklifi bulunamadı. Ölçüleri kontrol edip yeniden deneyin.");
    } catch (error) {
      if (!signal.aborted && latestScope.current === scope) setMessage(safeMessage(error));
    } finally { finish(signal); }
  }

  async function createShipment() {
    if (!quote || !usableQuote || !selectedOptionId || currentShipment !== null || inFlight.current !== "") return;
    if (Date.parse(quote.expiresAt) <= Date.now()) {
      setQuote(null); quoteScope.current = null; setSelectedOptionId("");
      setMessage("Kargo teklifi sona erdi; yeniden fiyat alın.");
      return;
    }
    const signal = begin("shipment");
    if (signal === null) return;
    try {
      const next = await shippingFulfillmentApi.createShipment(orderId, orderVersion, quote.credential, selectedOptionId, signal);
      if (signal.aborted || latestScope.current !== scope) return;
      setShipment(next);
      setQuote(null); quoteScope.current = null; setSelectedOptionId("");
      setOpen(false);
      setMessage("Gönderi oluşturuldu.");
    } catch (error) {
      if (!signal.aborted && latestScope.current === scope) setMessage(safeMessage(error));
    } finally { finish(signal); }
  }

  async function shipmentAction(action: "refresh" | "label" | "cancel" | "return") {
    if (!currentShipment || inFlight.current !== "") return;
    if (action === "cancel" && (currentShipment.status !== "ready" || !window.confirm("Bu gönderiyi iptal etmek istiyor musunuz?"))) return;
    if (action === "return" && (currentShipment.status !== "delivered" || !window.confirm("Bu sipariş için iade gönderisi oluşturulsun mu?"))) return;
    if (action === "refresh" && (["cancelled", "returned", "lost"] as Shipment["status"][]).includes(currentShipment.status)) return;
    if (action === "label" && (currentShipment.label.available || currentShipment.status === "cancelled")) return;
    const signal = begin(action);
    if (signal === null) return;
    try {
      const next = await shippingFulfillmentApi.shipmentAction(orderId, currentShipment.id, currentShipment.version, action, signal);
      if (!signal.aborted && latestScope.current === scope) setShipment(next);
    } catch (error) {
      if (!signal.aborted && latestScope.current === scope) setMessage(safeMessage(error));
    } finally { finish(signal); }
  }

  return (
    <div className={styles.console}>
      {currentShipment === undefined ? loadError ? (
        <div className={styles.loadError} role="alert"><span>{loadError}</span><button className={styles.button} type="button" onClick={() => setLoadAttempt((current) => current + 1)}>Tekrar dene</button></div>
      ) : <div className={styles.loading} role="status">Gönderi yükleniyor…</div> : currentShipment === null ? (
        <div className={styles.summary}><div><strong>Gönderi oluşturulmadı</strong><small>Basit Kargo</small></div><button className={styles.button} type="button" onClick={() => setOpen(true)}><Box aria-hidden="true" size={16} />Kargo seçenekleri</button></div>
      ) : (
        <>
          <div className={styles.summary}><div><span className={styles.status}><Truck aria-hidden="true" size={16} />{shipmentStatus(currentShipment.status)}</span><strong>{currentShipment.carrier ?? "Basit Kargo"}</strong></div></div>
          <dl className={styles.result}>
            {currentShipment.trackingNumber ? <div><dt>Takip numarası</dt><dd>{currentShipment.trackingUrl ? <a href={currentShipment.trackingUrl} target="_blank" rel="noreferrer">{currentShipment.trackingNumber}<ExternalLink aria-hidden="true" size={14} /></a> : currentShipment.trackingNumber}</dd></div> : null}
            {currentShipment.barcode ? <div><dt>Barkod</dt><dd><Barcode aria-hidden="true" size={16} />{currentShipment.barcode}</dd></div> : null}
          </dl>
          <div className={styles.actions}>
            {!(["cancelled", "returned", "lost"] as Shipment["status"][]).includes(currentShipment.status) ? <button className={styles.button} type="button" onClick={() => { void shipmentAction("refresh"); }} disabled={busy !== ""}><RefreshCw aria-hidden="true" size={16} />{busy === "refresh" ? "Güncelleniyor…" : "Durumu güncelle"}</button> : null}
            {currentShipment.label.available ? <a className={styles.button} href={shippingFulfillmentApi.shipmentLabelUrl(orderId, currentShipment.id)} target="_blank" rel="noreferrer"><Printer aria-hidden="true" size={16} />Etiketi aç</a> : currentShipment.status !== "cancelled" ? <button className={styles.button} type="button" onClick={() => { void shipmentAction("label"); }} disabled={busy !== ""}><Printer aria-hidden="true" size={16} />{busy === "label" ? "Hazırlanıyor…" : "Etiket hazırla"}</button> : null}
            {currentShipment.status === "ready" ? <button className={`${styles.button} ${styles.danger}`} type="button" onClick={() => { void shipmentAction("cancel"); }} disabled={busy !== ""}>{busy === "cancel" ? "İptal ediliyor…" : "Gönderiyi iptal et"}</button> : null}
            {currentShipment.status === "delivered" ? <button className={styles.button} type="button" onClick={() => { void shipmentAction("return"); }} disabled={busy !== ""}><RotateCcw aria-hidden="true" size={16} />{busy === "return" ? "Başlatılıyor…" : "İade başlat"}</button> : null}
          </div>
        </>
      )}
      {message && !open ? <p className={styles.message} role="status">{message}</p> : null}
      <OrderActionDialog open={open} title="Kargo seçenekleri" onClose={() => { if (!busy) setOpen(false); }} busy={busy !== ""} footer={<>
        <button className={styles.button} type="button" onClick={() => setOpen(false)} disabled={busy !== ""}>Vazgeç</button>
        {usableQuote && quote && quote.options.length > 0 ? <button className={`${styles.button} ${styles.primary}`} type="button" onClick={() => { void createShipment(); }} disabled={!selectedOptionId || busy !== "" || currentShipment !== null}>{busy === "shipment" ? "Oluşturuluyor…" : "Gönderiyi oluştur"}</button> : <button className={`${styles.button} ${styles.primary}`} form={formId} type="submit" disabled={busy !== "" || currentShipment !== null}>{busy === "quote" ? "Alınıyor…" : "Kargo teklifi al"}</button>}
      </>}>
        <div className={styles.modalContent}>
          <form className={styles.packageForm} id={formId} onSubmit={(event) => { void requestQuote(event); }}>
            <fieldset disabled={busy !== "" || currentShipment !== null}><legend>Paket ölçüleri</legend>
              {PACKAGE_FIELDS.map(([name, label, unit]) => <label key={name}><span>{label} · {unit}</span><input name={name} type="number" min="0.001" max="10000" step="0.001" value={packageValues[name]} onChange={(event) => changePackage(name, event.target.value)} required /></label>)}
            </fieldset>
          </form>
          {usableQuote && quote ? <div className={styles.quotes} role="group" aria-label="Kargo teklifleri">
            {quote.options.map((option) => <label key={option.id} className={styles.option}><input type="radio" name="shippingOption" value={option.id} checked={selectedOptionId === option.id} onChange={() => setSelectedOptionId(option.id)} disabled={busy !== ""} /><span><strong>{option.handlerName}</strong><small>{option.desiKg} desi</small></span><b>{money(option.priceCents + (option.codFeeCents ?? 0))}</b></label>)}
          </div> : null}
          {message ? <p className={styles.message} role="status">{message}</p> : null}
        </div>
      </OrderActionDialog>
    </div>
  );
}
