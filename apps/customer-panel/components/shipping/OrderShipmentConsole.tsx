"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Shipment, ShippingPackage, ShippingQuoteSession } from "@celebix/saas-contracts";

import {
  ShippingFulfillmentApiError,
  shippingFulfillmentApi,
} from "@/lib/shipping-ui/client";
import styles from "./order-shipment.module.css";

type BusyState = "" | "quote" | "shipment";

function money(cents: number) {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(cents / 100);
}

function value(data: FormData, name: string): number {
  const selected = Number(data.get(name));
  if (!Number.isFinite(selected) || selected < 0.001 || selected > 10_000) throw new ShippingFulfillmentApiError("invalid_input", 400);
  return selected;
}

function packageFrom(data: FormData): ShippingPackage {
  return Object.freeze({
    heightCm: value(data, "heightCm"),
    widthCm: value(data, "widthCm"),
    depthCm: value(data, "depthCm"),
    weightKg: value(data, "weightKg"),
  });
}

function safeMessage(error: unknown): string {
  return error instanceof ShippingFulfillmentApiError ? error.message : "Kargo işlemi şu anda tamamlanamadı.";
}

function shipmentStatus(status: Shipment["status"]): string {
  if (status === "ready") return "Hazır";
  if (status === "provider_outcome_unknown") return "Sonuç doğrulanıyor";
  if (status === "attention_required") return "İnceleme gerekiyor";
  return "İşleniyor";
}

export function OrderShipmentConsole({ orderId, orderVersion }: Readonly<{ orderId: string; orderVersion: number }>) {
  const [quote, setQuote] = useState<ShippingQuoteSession | null>(null);
  const [shipment, setShipment] = useState<Shipment | null | undefined>(undefined);
  const [selectedOptionId, setSelectedOptionId] = useState("");
  const [busy, setBusy] = useState<BusyState>("");
  const [message, setMessage] = useState("");
  const controller = useRef<AbortController | null>(null);
  const inFlight = useRef<BusyState>("");

  useEffect(() => {
    const load = new AbortController();
    void shippingFulfillmentApi.currentShipmentForOrder(orderId, load.signal).then((current) => {
      if (!load.signal.aborted) setShipment(current);
    }).catch((error: unknown) => {
      if (!load.signal.aborted) setMessage(safeMessage(error));
    });
    return () => { load.abort(); inFlight.current = ""; controller.current?.abort(); };
  }, [orderId]);

  function begin(next: Exclude<BusyState, "">) {
    if (inFlight.current !== "") return null;
    controller.current = new AbortController();
    inFlight.current = next;
    setBusy(next);
    setMessage("");
    return controller.current.signal;
  }

  async function requestQuote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const signal = begin("quote");
    if (signal === null) return;
    try {
      const next = await shippingFulfillmentApi.quote(orderId, orderVersion, [packageFrom(new FormData(event.currentTarget))], signal);
      if (signal.aborted) return;
      setQuote(next);
      setShipment(null);
      setSelectedOptionId(next.options[0]?.id ?? "");
    } catch (error) {
      if (!signal.aborted) setMessage(safeMessage(error));
    } finally {
      if (!signal.aborted && controller.current?.signal === signal) { inFlight.current = ""; setBusy(""); }
    }
  }

  async function createShipment() {
    if (!quote || !selectedOptionId || inFlight.current !== "") return;
    const signal = begin("shipment");
    if (signal === null) return;
    try {
      const next = await shippingFulfillmentApi.createShipment(orderId, orderVersion, quote.credential, selectedOptionId, signal);
      if (!signal.aborted) setShipment(next);
    } catch (error) {
      if (!signal.aborted) setMessage(safeMessage(error));
    } finally {
      if (!signal.aborted && controller.current?.signal === signal) { inFlight.current = ""; setBusy(""); }
    }
  }

  return (
    <div className={styles.console}>
      <div className={styles.provider}><strong>Basit Kargo</strong><span>Kontrollü gönderi</span></div>
      {shipment === null ? <form className={styles.packageForm} onSubmit={(event) => { void requestQuote(event); }}>
        <fieldset disabled={busy !== ""}>
          <legend>Paket ölçüleri</legend>
          <label><span>En</span><input name="widthCm" type="number" min="0.001" max="10000" step="0.001" defaultValue="20" required /><small>cm</small></label>
          <label><span>Boy</span><input name="depthCm" type="number" min="0.001" max="10000" step="0.001" defaultValue="20" required /><small>cm</small></label>
          <label><span>Yükseklik</span><input name="heightCm" type="number" min="0.001" max="10000" step="0.001" defaultValue="10" required /><small>cm</small></label>
          <label><span>Ağırlık</span><input name="weightKg" type="number" min="0.001" max="10000" step="0.001" defaultValue="1" required /><small>kg</small></label>
          <button type="submit">{busy === "quote" ? "Alınıyor…" : "Kargo teklifi al"}</button>
        </fieldset>
      </form> : null}

      {quote ? (
        <div className={styles.quotes}>
          {quote.options.map((option) => (
            <label key={option.id} className={styles.option}>
              <input type="radio" name="shippingOption" value={option.id} checked={selectedOptionId === option.id} onChange={() => setSelectedOptionId(option.id)} disabled={busy !== ""} />
              <span><strong>{option.handlerName}</strong><small>Tahmini · {option.desiKg} desi</small></span>
              <b>{money(option.priceCents + (option.codFeeCents ?? 0))}</b>
            </label>
          ))}
          <button className={styles.create} type="button" onClick={() => { void createShipment(); }} disabled={!selectedOptionId || busy !== "" || shipment !== null}>
            {busy === "shipment" ? "Oluşturuluyor…" : "Gönderiyi oluştur"}
          </button>
        </div>
      ) : null}

      {shipment ? (
        <dl className={styles.result}>
          <div><dt>Durum</dt><dd>{shipmentStatus(shipment.status)}</dd></div>
          {shipment.carrier ? <div><dt>Kargo firması</dt><dd>{shipment.carrier}</dd></div> : null}
          {shipment.trackingNumber ? <div><dt>Takip numarası</dt><dd>{shipment.trackingNumber}</dd></div> : null}
          {shipment.barcode ? <div><dt>Barkod</dt><dd>{shipment.barcode}</dd></div> : null}
        </dl>
      ) : null}
      <p className={styles.message} aria-live="polite">{message}</p>
    </div>
  );
}
