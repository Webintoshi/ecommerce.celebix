"use client";

import { ScanBarcode } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { reserveInternalBarcode } from "@/lib/barcode-labels/reserve-internal";
import styles from "./barcode-input.module.css";

type BarcodeInputProps = Readonly<{
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?(value: string): void;
  onGenerated?(): void;
  labelClassName?: string;
  reservationIdentity?: object;
  reserve?: () => Promise<string>;
}>;

function reservationMessage(error: unknown): string {
  const code = error instanceof Error ? error.message : "unavailable";
  if (code === "forbidden" || code === "membership_denied") return "Bu mağazada barkod oluşturma yetkiniz yok.";
  if (code === "unauthenticated") return "Oturumunuz sona erdi. Yeniden giriş yapın.";
  return "Barkod oluşturulamadı. Biraz sonra yeniden deneyin.";
}

export function BarcodeInput({
  name = "barcode", value, defaultValue = "", onChange, onGenerated,
  labelClassName, reservationIdentity, reserve = reserveInternalBarcode,
}: BarcodeInputProps) {
  const [draft, setDraft] = useState(defaultValue);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const busyRef = useRef(false);
  const mountedRef = useRef(false);
  const identityRef = useRef(reservationIdentity);
  const onChangeRef = useRef(onChange);
  const onGeneratedRef = useRef(onGenerated);
  const currentValue = value ?? draft;
  const currentRef = useRef(currentValue);
  currentRef.current = currentValue;
  identityRef.current = reservationIdentity;
  onChangeRef.current = onChange;
  onGeneratedRef.current = onGenerated;
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  function update(next: string) {
    currentRef.current = next;
    if (value === undefined) setDraft(next);
    onChangeRef.current?.(next);
    if (error) setError("");
  }

  async function generate() {
    if (busyRef.current || currentRef.current.trim()) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    const owner = identityRef.current;
    try {
      const barcode = await reserve();
      if (!mountedRef.current || identityRef.current !== owner || currentRef.current.trim()) return;
      update(barcode);
      onGeneratedRef.current?.();
      inputRef.current?.focus();
    } catch (caught) {
      if (mountedRef.current && identityRef.current === owner) setError(reservationMessage(caught));
    } finally {
      busyRef.current = false;
      if (mountedRef.current) setBusy(false);
    }
  }

  return <div className={`${styles.root ?? ""} ${labelClassName ?? ""}`}>
    <label htmlFor={`${id}-input`}>Barkod</label>
    <span className={styles.control}>
      <input
        id={`${id}-input`} ref={inputRef} className={styles.input} name={name} maxLength={128}
        value={currentValue} onChange={(event) => update(event.currentTarget.value)}
        style={{ minHeight: 48, paddingRight: 55 }}
        aria-describedby={error ? id : undefined}
      />
      <button
        className={styles.generate} type="button"
        aria-label="Dahili barkod oluştur" title={currentValue.trim() ? "Yeni barkod için önce alanı temizleyin" : "Dahili Code 128 oluşturur; EAN/GTIN değildir"}
        disabled={busy || Boolean(currentValue.trim())} onClick={() => void generate()}
      ><ScanBarcode aria-hidden="true" /></button>
    </span>
    {error ? <small id={id} className={styles.error} role="alert">{error}</small> : null}
  </div>;
}
