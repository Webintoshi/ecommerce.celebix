"use client";

import type { InventoryCount, InventoryTransfer, PurchaseOrder } from "@celebix/saas-contracts";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import type {
  ReceivePurchaseOrderIntent,
  SaveInventoryCountIntent,
  SaveInventoryTransferIntent,
  SavePurchaseOrderIntent,
} from "@/lib/inventory-ui/client";
import {
  createInventoryFormChoiceLifecycle,
  loadInventoryFormChoices,
  type InventoryFormChoiceSnapshot,
  type InventoryVariantChoice,
} from "@/lib/inventory-ui/form-choices";
import type { InventoryConsolePhase } from "@/lib/inventory-ui/console-controller";
import {
  buildInventoryOperationIntent,
  buildPurchaseReceiptIntent,
  type InventoryOperationDraftLine,
} from "@/lib/inventory-ui/form-intent";
import styles from "./inventory-console.module.css";

type Mode = "purchase" | "count" | "transfer";
type RecordValue = PurchaseOrder | InventoryCount | InventoryTransfer;
type SaveIntent = SavePurchaseOrderIntent | SaveInventoryCountIntent | SaveInventoryTransferIntent;
type DraftLine = InventoryOperationDraftLine;
type Props = Readonly<{
  mode: Mode;
  record?: RecordValue;
  canManage: boolean;
  phase: InventoryConsolePhase;
  pending: boolean;
  locked: boolean;
  message: string;
  onSave(value: SaveIntent): void;
}>;

const EMPTY_CHOICES: InventoryFormChoiceSnapshot = Object.freeze({
  phase: "loading",
  choices: Object.freeze({ products: Object.freeze([]), variants: Object.freeze([]), locations: Object.freeze([]) }),
});
const newLine = (): DraftLine => Object.freeze({
  lineId: "",
  variantId: "",
  quantity: "1",
  unitCostCents: "0",
});
const statusError = (phase: InventoryConsolePhase, message: string) => {
  if (phase === "verification_unavailable") return message || "İşlem sonucu doğrulanamıyor. Yeni işlem göndermeden sayfayı tamamen yenileyin.";
  if (phase === "conflict") return message || "Kayıt sizden önce başka bir işlem tarafından değiştirildi.";
  if (phase === "error") return message || "İşlem tamamlanamadı.";
  return "";
};
function isPurchase(record: RecordValue | undefined): record is PurchaseOrder {
  return record !== undefined && "supplierName" in record;
}
function isCount(record: RecordValue | undefined): record is InventoryCount {
  return record !== undefined && "locationId" in record && !("supplierName" in record);
}
function isTransfer(record: RecordValue | undefined): record is InventoryTransfer {
  return record !== undefined && "sourceLocationId" in record;
}
function initialLines(mode: Mode, record?: RecordValue): readonly DraftLine[] {
  if (isPurchase(record)) return Object.freeze(record.lines.map((line) => Object.freeze({
    lineId: line.id, variantId: line.variantId, quantity: String(line.orderedQuantity), unitCostCents: String(line.unitCostCents),
  })));
  if (isCount(record)) return Object.freeze(record.lines.map((line) => Object.freeze({
    lineId: line.id, variantId: line.variantId, quantity: String(line.countedQuantity ?? 0), unitCostCents: "0",
  })));
  if (isTransfer(record)) return Object.freeze(record.lines.map((line) => Object.freeze({
    lineId: line.id, variantId: line.variantId, quantity: String(line.quantity), unitCostCents: "0",
  })));
  return Object.freeze([newLine()]);
}
function label(mode: Mode) {
  return mode === "purchase" ? "Satın alma siparişi" : mode === "count" ? "Stok sayımı" : "Stok transferi";
}
function variantLabel(choice: InventoryVariantChoice) {
  return `${choice.productTitle} — ${choice.variantTitle}${choice.sku ? ` (${choice.sku})` : ""} — ${choice.variantId}`;
}

export function InventoryOperationForm(props: Props) {
  const [choices, setChoices] = useState<InventoryFormChoiceSnapshot>(EMPTY_CHOICES);
  const choiceLifecycle = useRef<ReturnType<typeof createInventoryFormChoiceLifecycle> | null>(null);
  if (!choiceLifecycle.current) choiceLifecycle.current = createInventoryFormChoiceLifecycle(
    (signal) => loadInventoryFormChoices(undefined, signal),
    setChoices,
  );
  const [supplierName, setSupplierName] = useState(isPurchase(props.record) ? props.record.supplierName : "");
  const [locationId, setLocationId] = useState(isPurchase(props.record) || isCount(props.record) ? props.record.locationId : "");
  const [sourceLocationId, setSourceLocationId] = useState(isTransfer(props.record) ? props.record.sourceLocationId : "");
  const [destinationLocationId, setDestinationLocationId] = useState(isTransfer(props.record) ? props.record.destinationLocationId : "");
  const [lines, setLines] = useState<readonly DraftLine[]>(() => initialLines(props.mode, props.record));
  const [validation, setValidation] = useState("");
  const persistedKey = props.record ? `${props.record.id}:${props.record.version}` : "new";
  useEffect(() => choiceLifecycle.current!.setup(), []);
  useEffect(() => {
    setSupplierName(isPurchase(props.record) ? props.record.supplierName : "");
    setLocationId(isPurchase(props.record) || isCount(props.record) ? props.record.locationId : "");
    setSourceLocationId(isTransfer(props.record) ? props.record.sourceLocationId : "");
    setDestinationLocationId(isTransfer(props.record) ? props.record.destinationLocationId : "");
    setLines(initialLines(props.mode, props.record));
  }, [persistedKey, props.mode]);
  const knownVariants = useMemo(() => new Set(choices.choices.variants.map((choice) => choice.variantId)), [choices]);
  const knownLocations = useMemo(() => new Set(choices.choices.locations.map((choice) => choice.locationId)), [choices]);
  const disabled = props.pending || props.locked || choices.phase !== "loaded";
  const unavailable = choices.phase === "unavailable";
  const empty = choices.phase === "loaded" && (!choices.choices.locations.length || !choices.choices.variants.length);

  function updateLine(index: number, update: Partial<DraftLine>) {
    setLines((current) => Object.freeze(current.map((line, candidate) => candidate === index ? Object.freeze({ ...line, ...update }) : line)));
  }
  function addLine() {
    if (lines.length < 500) setLines((current) => Object.freeze([...current, newLine()]));
  }
  function removeLine(index: number) {
    if (lines.length > 1) setLines((current) => Object.freeze(current.filter((_, candidate) => candidate !== index)));
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setValidation("");
    if (!props.canManage || disabled || empty) return;
    const submitLines = Object.freeze(lines.map((line) => Object.freeze({
      ...line,
      lineId: line.lineId || crypto.randomUUID(),
    })));
    const parsed = buildInventoryOperationIntent({
      mode: props.mode,
      ...(props.record ? { record: props.record } : {}),
      supplierName,
      locationId,
      sourceLocationId,
      destinationLocationId,
      lines: submitLines,
    }, { locationIds: knownLocations, variantIds: knownVariants });
    if (!parsed.ok) { setValidation(parsed.message); return; }
    props.onSave(parsed.value);
  }

  if (!props.canManage) return <div className={styles.denied} role="status">{label(props.mode)} oluşturma veya düzenleme yetkiniz yok.</div>;
  return <section className={styles.operationForm} aria-labelledby={`${props.mode}-form-title`}>
    <header><h2 id={`${props.mode}-form-title`}>{props.record ? `${label(props.mode)} düzenle` : `Yeni ${label(props.mode).toLocaleLowerCase("tr-TR")}`}</h2><p>Seçenekler yalnız kalıcı etkin ürün, varyant ve konum kayıtlarından gelir.</p></header>
    {choices.phase === "loading" ? <p className={styles.state} role="status">Etkin ürün ve konum seçenekleri yükleniyor…</p> : null}
    {unavailable ? <p className={styles.errorNotice} role="alert">Ürün veya konum seçenekleri güvenli biçimde yüklenemedi. Kısmi seçeneklerle işlem yapılamaz.</p> : null}
    {empty ? <p className={styles.state} role="status">İşlem için en az bir etkin konum ve etkin ürün varyantı gerekir.</p> : null}
    {statusError(props.phase, props.message) ? <p className={props.phase === "conflict" ? styles.conflict : styles.errorNotice} role="alert">{statusError(props.phase, props.message)}</p> : null}
    {validation ? <p className={styles.errorNotice} role="alert">{validation}</p> : null}
    <p className={styles.srStatus} aria-live="polite">{props.pending ? "İşlem kalıcı kayda gönderiliyor." : props.message}</p>
    <form onSubmit={submit} noValidate>
      <fieldset disabled={disabled || empty}>
        <legend>İşlem ayrıntıları</legend>
        <div className={styles.operationFields}>
          {props.mode === "purchase" ? <label><span>Tedarikçi adı</span><input value={supplierName} required maxLength={200} onChange={(event) => setSupplierName(event.target.value)} /></label> : null}
          {props.mode !== "transfer" ? <label><span>Etkin konum</span><select value={locationId} required onChange={(event) => setLocationId(event.target.value)}><option value="">Konum seçin</option>{choices.choices.locations.map((choice) => <option key={choice.locationId} value={choice.locationId}>{choice.name}{choice.isDefault ? " — Varsayılan" : ""} — {choice.locationId}</option>)}</select></label> : <>
            <label><span>Kaynak konum</span><select value={sourceLocationId} required onChange={(event) => setSourceLocationId(event.target.value)}><option value="">Kaynak seçin</option>{choices.choices.locations.map((choice) => <option key={choice.locationId} value={choice.locationId}>{choice.name} — {choice.locationId}</option>)}</select></label>
            <label><span>Hedef konum</span><select value={destinationLocationId} required onChange={(event) => setDestinationLocationId(event.target.value)}><option value="">Hedef seçin</option>{choices.choices.locations.map((choice) => <option key={choice.locationId} value={choice.locationId}>{choice.name} — {choice.locationId}</option>)}</select></label>
          </>}
        </div>
      </fieldset>
      <fieldset disabled={disabled || empty}>
        <legend>Kalemler</legend>
        <div className={styles.desktopFormTable}><table><thead><tr><th>Varyant</th><th>{props.mode === "purchase" ? "Sipariş miktarı" : props.mode === "count" ? "Sayılan miktar" : "Transfer miktarı"}</th>{props.mode === "purchase" ? <th>Birim maliyet (kuruş)</th> : null}<th>Kalem kimliği</th><th /></tr></thead><tbody>{lines.map((line, index) => <tr key={`${line.lineId || "new"}-${index}`}><td><select aria-label={`${index + 1}. kalem varyantı`} value={line.variantId} onChange={(event) => updateLine(index, { variantId: event.target.value })}><option value="">Varyant seçin</option>{choices.choices.variants.map((choice) => <option key={choice.variantId} value={choice.variantId}>{variantLabel(choice)}</option>)}</select></td><td><input aria-label={`${index + 1}. kalem miktarı`} inputMode="numeric" value={line.quantity} onChange={(event) => updateLine(index, { quantity: event.target.value })} /></td>{props.mode === "purchase" ? <td><input aria-label={`${index + 1}. kalem birim maliyeti`} inputMode="numeric" value={line.unitCostCents} onChange={(event) => updateLine(index, { unitCostCents: event.target.value })} /></td> : null}<td><code>{line.lineId || "Gönderimde atanacak"}</code></td><td><button type="button" disabled={lines.length === 1} onClick={() => removeLine(index)}>Kaldır</button></td></tr>)}</tbody></table></div>
        <div className={styles.mobileFormCards}>{lines.map((line, index) => <article key={`${line.lineId || "new"}-${index}`}><label><span>Varyant</span><select value={line.variantId} onChange={(event) => updateLine(index, { variantId: event.target.value })}><option value="">Varyant seçin</option>{choices.choices.variants.map((choice) => <option key={choice.variantId} value={choice.variantId}>{variantLabel(choice)}</option>)}</select></label><label><span>{props.mode === "count" ? "Sayılan miktar" : "Miktar"}</span><input inputMode="numeric" value={line.quantity} onChange={(event) => updateLine(index, { quantity: event.target.value })} /></label>{props.mode === "purchase" ? <label><span>Birim maliyet (kuruş)</span><input inputMode="numeric" value={line.unitCostCents} onChange={(event) => updateLine(index, { unitCostCents: event.target.value })} /></label> : null}<code>{line.lineId || "Gönderimde atanacak"}</code><button type="button" disabled={lines.length === 1} onClick={() => removeLine(index)}>Kalemi kaldır</button></article>)}</div>
        <button className={styles.secondaryAction} type="button" disabled={lines.length >= 500} onClick={addLine}>Kalem ekle</button>
      </fieldset>
      <div className={styles.actions}><button className={styles.primary} type="submit" disabled={disabled || empty}>{props.pending ? "Kaydediliyor…" : props.record ? "Değişiklikleri kaydet" : "Taslağı oluştur"}</button></div>
    </form>
  </section>;
}

export function PurchaseReceiptForm(props: Readonly<{
  record: PurchaseOrder;
  pending: boolean;
  locked: boolean;
  onReceive(lines: ReceivePurchaseOrderIntent["lines"]): void;
}>) {
  const [quantities, setQuantities] = useState<Readonly<Record<string, string>>>(() => Object.freeze(Object.fromEntries(props.record.lines.map((line) => [line.id, "0"]))));
  const [error, setError] = useState("");
  const remaining = props.record.lines.filter((line) => line.orderedQuantity > line.receivedQuantity);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = buildPurchaseReceiptIntent(props.record, quantities);
    if (!parsed.ok) { setError(parsed.message); return; }
    setError("");
    props.onReceive(parsed.value);
  }
  return <form className={styles.receiptForm} onSubmit={submit}><fieldset disabled={props.pending || props.locked}><legend>Kısmi teslim al</legend>{error ? <p className={styles.errorNotice} role="alert">{error}</p> : null}{remaining.map((line) => <label key={line.id}><span><code>{line.id}</code> — Kalan {line.orderedQuantity - line.receivedQuantity}</span><input aria-label={`${line.id} teslim miktarı`} inputMode="numeric" value={quantities[line.id] ?? "0"} onChange={(event) => setQuantities((current) => Object.freeze({ ...current, [line.id]: event.target.value }))} /></label>)}<button className={styles.primary} type="submit">Seçilen miktarları teslim al</button></fieldset></form>;
}
