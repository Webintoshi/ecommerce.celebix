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
} from "@/lib/inventory-ui/form-choices";
import type { InventoryConsolePhase } from "@/lib/inventory-ui/console-controller";
import {
  buildPurchaseReceiptIntent,
  initialPurchaseReceiptQuantities,
  purchaseReceiptRevision,
  submitInventoryOperationForm,
  type InventoryOperationDraftLine,
} from "@/lib/inventory-ui/form-intent";
import { inventoryVariantLabel, inventoryVariantOptions } from "@/lib/inventory-ui/form-presentation";
import { formatInventoryMoneyInput, parseInventoryMoneyToCents } from "@/lib/inventory-ui/money";
import { useOptionalInventoryWorkspace } from "./InventoryWorkspaceContext";
import styles from "./inventory-console.module.css";

type Mode = "purchase" | "count" | "transfer";
type RecordValue = PurchaseOrder | InventoryCount | InventoryTransfer;
type SaveIntent = SavePurchaseOrderIntent | SaveInventoryCountIntent | SaveInventoryTransferIntent;
type DraftLine = Omit<InventoryOperationDraftLine, "unitCostCents"> & Readonly<{ unitCost: string }>;
export type InventoryConsoleActivity = Readonly<{ pending: boolean; locked: boolean; dirty?: boolean }>;
type Props = Readonly<{
  mode: Mode;
  record?: RecordValue;
  canManage: boolean;
  phase: InventoryConsolePhase;
  pending: boolean;
  locked: boolean;
  message: string;
  initialLocationId?: string;
  initialVariantId?: string;
  onDirtyChange?(dirty: boolean): void;
  onSave(value: SaveIntent): void;
}>;

const EMPTY_CHOICES: InventoryFormChoiceSnapshot = Object.freeze({
  phase: "loading",
  choices: Object.freeze({ products: Object.freeze([]), variants: Object.freeze([]), locations: Object.freeze([]) }),
});
const newLine = (mode: Mode, variantId = ""): DraftLine => Object.freeze({
  lineId: "", variantId, quantity: mode === "count" ? "" : "1", unitCost: "0,00",
});
const statusError = (phase: InventoryConsolePhase, message: string) => {
  if (phase === "mutation_rejected") return message || "İşlem uygulanmadı. Alanları kontrol edip yeniden deneyebilirsiniz.";
  if (phase === "denied") return message || "Bu envanter işlemi için yetkiniz yok.";
  if (phase === "verification_unavailable") return message || "İşlem sonucu doğrulanamıyor. Yeni işlem göndermeden sayfayı tamamen yenileyin.";
  if (phase === "conflict") return message || "Kayıt sizden önce başka bir işlem tarafından değiştirildi.";
  if (phase === "error") return message || "İşlem tamamlanamadı.";
  return "";
};

export function InventoryOperationFeedback(props: Readonly<{ phase: InventoryConsolePhase; message: string }>) {
  const message = statusError(props.phase, props.message);
  if (!message) return null;
  return <p className={props.phase === "conflict" ? styles.conflict : styles.errorNotice} role="alert">{message}</p>;
}
function isPurchase(record: RecordValue | undefined): record is PurchaseOrder {
  return record !== undefined && "supplierName" in record;
}
function isCount(record: RecordValue | undefined): record is InventoryCount {
  return record !== undefined && "locationId" in record && !("supplierName" in record);
}
function isTransfer(record: RecordValue | undefined): record is InventoryTransfer {
  return record !== undefined && "sourceLocationId" in record;
}
function initialLines(mode: Mode, record?: RecordValue, variantId = ""): readonly DraftLine[] {
  if (isPurchase(record)) return Object.freeze(record.lines.map((line) => Object.freeze({
    lineId: line.id, variantId: line.variantId, quantity: String(line.orderedQuantity), unitCost: formatInventoryMoneyInput(line.unitCostCents),
  })));
  if (isCount(record)) return Object.freeze(record.lines.map((line) => Object.freeze({
    lineId: line.id, variantId: line.variantId, quantity: String(line.countedQuantity ?? ""), unitCost: "0,00",
  })));
  if (isTransfer(record)) return Object.freeze(record.lines.map((line) => Object.freeze({
    lineId: line.id, variantId: line.variantId, quantity: String(line.quantity), unitCost: "0,00",
  })));
  return Object.freeze([newLine(mode, variantId)]);
}
function label(mode: Mode) {
  return mode === "purchase" ? "Satın alma siparişi" : mode === "count" ? "Stok sayımı" : "Stok transferi";
}
function formTitle(mode: Mode) {
  return mode === "purchase" ? "Sipariş bilgileri" : mode === "count" ? "Sayım bilgileri" : "Transfer bilgileri";
}

export function InventoryOperationForm(props: Props) {
  const workspace = useOptionalInventoryWorkspace();
  const [standaloneChoices, setChoices] = useState<InventoryFormChoiceSnapshot>(EMPTY_CHOICES);
  const choices: InventoryFormChoiceSnapshot = workspace
    ? workspace.phase === "loaded"
      ? { phase: "loaded", choices: workspace.formChoices }
      : { ...EMPTY_CHOICES, phase: workspace.phase === "error" ? "unavailable" : "loading" }
    : standaloneChoices;
  const [productSearch, setProductSearch] = useState("");
  const choiceLifecycle = useRef<ReturnType<typeof createInventoryFormChoiceLifecycle> | null>(null);
  if (!choiceLifecycle.current) choiceLifecycle.current = createInventoryFormChoiceLifecycle(
    (signal) => loadInventoryFormChoices(undefined, signal),
    setChoices,
  );
  const [supplierName, setSupplierName] = useState(isPurchase(props.record) ? props.record.supplierName : "");
  const [locationId, setLocationId] = useState(isPurchase(props.record) || isCount(props.record) ? props.record.locationId : props.initialLocationId ?? "");
  const [sourceLocationId, setSourceLocationId] = useState(isTransfer(props.record) ? props.record.sourceLocationId : props.initialLocationId ?? "");
  const [destinationLocationId, setDestinationLocationId] = useState(isTransfer(props.record) ? props.record.destinationLocationId : "");
  const [lines, setLines] = useState<readonly DraftLine[]>(() => initialLines(props.mode, props.record, props.initialVariantId));
  const [validation, setValidation] = useState("");
  const persistedKey = props.record ? `${props.record.id}:${props.record.version}` : "new";
  useEffect(() => workspace ? undefined : choiceLifecycle.current!.setup(), [Boolean(workspace)]);
  useEffect(() => {
    setSupplierName(isPurchase(props.record) ? props.record.supplierName : "");
    setLocationId(isPurchase(props.record) || isCount(props.record) ? props.record.locationId : props.initialLocationId ?? "");
    setSourceLocationId(isTransfer(props.record) ? props.record.sourceLocationId : props.initialLocationId ?? "");
    setDestinationLocationId(isTransfer(props.record) ? props.record.destinationLocationId : "");
    setLines(initialLines(props.mode, props.record, props.initialVariantId));
    props.onDirtyChange?.(false);
  }, [persistedKey, props.mode]);
  useEffect(() => {
    if (props.record || choices.phase !== "loaded") return;
    const preferred = choices.choices.locations.find(choice => choice.isDefault) ?? choices.choices.locations[0];
    if (!preferred) return;
    setLocationId(current => current || preferred.locationId);
    setSourceLocationId(current => current || preferred.locationId);
  }, [persistedKey, choices.phase, choices.choices.locations]);
  const knownVariants = useMemo(() => new Set(choices.choices.variants.map((choice) => choice.variantId)), [choices]);
  const knownLocations = useMemo(() => new Set(choices.choices.locations.map((choice) => choice.locationId)), [choices]);
  const disabled = props.pending || props.locked || choices.phase !== "loaded";
  const unavailable = choices.phase === "unavailable";
  const empty = choices.phase === "loaded" && (!choices.choices.locations.length || !choices.choices.variants.length);
  const fixedCountAuthority = isCount(props.record) && props.record.status === "counting";
  const countDraft = props.mode === "count" && !fixedCountAuthority;
  const markDirty = () => props.onDirtyChange?.(true);
  const quantityLabel = props.mode === "purchase" ? "Sipariş miktarı" : props.mode === "count" ? "Sayılan miktar" : "Transfer miktarı";
  function variantSelect(line: DraftLine, index: number) {
    const options = inventoryVariantOptions(choices.choices.variants, productSearch, line.variantId);
    return <select aria-label={`${index + 1}. ürün ve varyant`} value={line.variantId} disabled={fixedCountAuthority} onChange={event => updateLine(index, { variantId: event.target.value })}>
      <option value="">Ürün seçin</option>
      {line.variantId && !knownVariants.has(line.variantId) ? <option value={line.variantId}>Ürün bilgisi yüklenemedi</option> : null}
      {options.map(choice => <option key={choice.variantId} value={choice.variantId}>{inventoryVariantLabel(choice)}</option>)}
    </select>;
  }

  function updateLine(index: number, update: Partial<DraftLine>) {
    markDirty();
    setLines((current) => Object.freeze(current.map((line, candidate) => candidate === index ? Object.freeze({ ...line, ...update }) : line)));
  }
  function addLine() {
    if (lines.length < 500) { markDirty(); setLines(current => Object.freeze([...current, newLine(props.mode)])); }
  }
  function removeLine(index: number) {
    if (lines.length > 1) { markDirty(); setLines(current => Object.freeze(current.filter((_, candidate) => candidate !== index))); }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setValidation("");
    if (!props.canManage || disabled || empty) return;
    let submittedLines: readonly InventoryOperationDraftLine[];
    try {
      submittedLines = lines.map(({ unitCost, ...line }) => ({ ...line, unitCostCents: props.mode === "purchase" ? String(parseInventoryMoneyToCents(unitCost)) : "0" }));
    } catch {
      setValidation("Birim maliyeti TL olarak girin. Örnek: 14,89.");
      return;
    }
    const parsed = submitInventoryOperationForm({
      mode: props.mode,
      ...(props.record ? { record: props.record } : {}),
      supplierName,
      locationId,
      sourceLocationId,
      destinationLocationId,
      lines: submittedLines,
    }, { locationIds: knownLocations, variantIds: knownVariants }, props.onSave);
    if (!parsed.ok) { setValidation(parsed.message); return; }
  }

  if (!props.canManage) return <div className={styles.denied} role="status">{label(props.mode)} oluşturma veya düzenleme yetkiniz yok.</div>;
  return <section className={`${styles.operationForm} ${props.record ? "" : styles.operationFormCreate}`} aria-labelledby={`${props.mode}-form-title`}>
    <header><h2 id={`${props.mode}-form-title`}>{formTitle(props.mode)}</h2></header>
    {choices.phase === "loading" ? <p className={styles.state} role="status">Ürün ve depo seçenekleri yükleniyor…</p> : null}
    {unavailable ? <p className={styles.errorNotice} role="alert">Ürünler veya depolar yüklenemedi. Sayfayı yenileyip tekrar deneyin.</p> : null}
    {empty ? <p className={styles.state} role="status">İşlem için en az bir aktif depo ve ürün gerekir.</p> : null}
    <InventoryOperationFeedback phase={props.phase} message={props.message} />
    {validation ? <p className={styles.errorNotice} role="alert">{validation}</p> : null}
    <p className={styles.srStatus} aria-live="polite">{props.pending ? "İşlem kaydediliyor." : props.record ? "" : props.message}</p>
    <form onSubmit={submit} noValidate>
      <fieldset disabled={disabled || empty}>
        <legend>İşlem ayrıntıları</legend>
        <div className={styles.operationFields}>
          {props.mode === "purchase" ? <label><span>Tedarikçi adı</span><input value={supplierName} required maxLength={200} onChange={event => { markDirty(); setSupplierName(event.target.value); }} /></label> : null}
          {props.mode !== "transfer" ? <label><span>Depo</span><select value={locationId} required disabled={fixedCountAuthority} onChange={event => { markDirty(); setLocationId(event.target.value); }}><option value="">Depo seçin</option>{choices.choices.locations.map((choice) => <option key={choice.locationId} value={choice.locationId}>{choice.name}{choice.isDefault ? " — Varsayılan" : ""}</option>)}</select></label> : <>
            <label><span>Kaynak depo</span><select value={sourceLocationId} required onChange={event => { markDirty(); setSourceLocationId(event.target.value); }}><option value="">Kaynak seçin</option>{choices.choices.locations.map((choice) => <option key={choice.locationId} value={choice.locationId}>{choice.name}</option>)}</select></label>
            <label><span>Hedef depo</span><select value={destinationLocationId} required onChange={event => { markDirty(); setDestinationLocationId(event.target.value); }}><option value="">Hedef seçin</option>{choices.choices.locations.map((choice) => <option key={choice.locationId} value={choice.locationId}>{choice.name}</option>)}</select></label>
          </>}
        </div>
      </fieldset>
      <fieldset disabled={disabled || empty}>
        <legend>Kalemler <span className={styles.fieldCount}>{lines.length}</span></legend>
        {!fixedCountAuthority ? <label className={styles.productSearch}><span>Ürün veya SKU ara</span><input type="search" value={productSearch} onChange={event => setProductSearch(event.target.value)} aria-describedby={`${props.mode}-search-help`} /><small id={`${props.mode}-search-help`}>En fazla 50 eşleşme gösterilir. Seçtiğiniz ürünler korunur.</small></label> : null}
        {countDraft ? <p className={styles.formHelp}>Ürünleri seçin. Sayımı başlattığınızda depo stoku sabitlenir ve saydığınız miktarları girebilirsiniz.</p> : null}
        <div className={styles.desktopFormTable} role="region" tabIndex={0} aria-label="Düzenlenen işlem kalemleri"><table><thead><tr><th>Ürün / Varyant</th>{!countDraft ? <th>{quantityLabel}</th> : null}{props.mode === "purchase" ? <th>Birim maliyet (₺)</th> : null}<th /></tr></thead><tbody>{lines.map((line, index) => <tr key={`${line.lineId || "new"}-${index}`}><td>{variantSelect(line, index)}</td>{!countDraft ? <td><input aria-label={`${index + 1}. kalem miktarı`} inputMode="numeric" value={line.quantity} onChange={event => updateLine(index, { quantity: event.target.value })} /></td> : null}{props.mode === "purchase" ? <td><input aria-label={`${index + 1}. kalem birim maliyeti, TL`} inputMode="decimal" value={line.unitCost} onChange={event => updateLine(index, { unitCost: event.target.value })} /></td> : null}<td>{!fixedCountAuthority ? <button type="button" disabled={lines.length === 1} onClick={() => removeLine(index)}>Kaldır</button> : null}</td></tr>)}</tbody></table></div>
        <div className={styles.mobileFormCards}>{lines.map((line, index) => <article key={`${line.lineId || "new"}-${index}`}><strong className={styles.lineHeading}>{index + 1}. ürün</strong><label><span>Ürün / Varyant</span>{variantSelect(line, index)}</label>{!countDraft ? <label><span>{quantityLabel}</span><input inputMode="numeric" value={line.quantity} onChange={event => updateLine(index, { quantity: event.target.value })} /></label> : null}{props.mode === "purchase" ? <label><span>Birim maliyet (₺)</span><input inputMode="decimal" value={line.unitCost} onChange={event => updateLine(index, { unitCost: event.target.value })} /></label> : null}{!fixedCountAuthority ? <button type="button" disabled={lines.length === 1} onClick={() => removeLine(index)}>Ürünü kaldır</button> : null}</article>)}</div>
        {!fixedCountAuthority ? <button className={styles.secondaryAction} type="button" disabled={lines.length >= 500} onClick={addLine}>Ürün ekle</button> : null}
      </fieldset>
      <div className={styles.actions}><button className={props.record ? undefined : styles.primary} type="submit" disabled={disabled || empty}>{props.pending ? "Kaydediliyor…" : props.record ? "Değişiklikleri kaydet" : "Taslağı oluştur"}</button></div>
    </form>
  </section>;
}

export function PurchaseReceiptForm(props: Readonly<{
  record: PurchaseOrder;
  pending: boolean;
  locked: boolean;
  onDirtyChange?(dirty: boolean): void;
  onReceive(lines: ReceivePurchaseOrderIntent["lines"]): void;
}>) {
  const workspace = useOptionalInventoryWorkspace();
  const revision = purchaseReceiptRevision(props.record);
  const [quantities, setQuantities] = useState<Readonly<Record<string, string>>>(() => initialPurchaseReceiptQuantities(props.record));
  const [error, setError] = useState("");
  useEffect(() => {
    setQuantities(initialPurchaseReceiptQuantities(props.record));
    setError("");
    props.onDirtyChange?.(false);
  }, [revision]);
  const remaining = props.record.lines.filter((line) => line.orderedQuantity > line.receivedQuantity);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = buildPurchaseReceiptIntent(props.record, quantities);
    if (!parsed.ok) { setError(parsed.message); return; }
    setError("");
    props.onReceive(parsed.value);
  }
  return <form className={styles.receiptForm} onSubmit={submit}><fieldset disabled={props.pending || props.locked}><legend>Teslim alınan ürünler</legend>{error ? <p className={styles.errorNotice} role="alert">{error}</p> : null}{remaining.map((line, index) => <label key={line.id}><span>{workspace?.variantName(line.variantId) ?? "Ürün bilgisi yüklenemedi"} — Kalan {line.orderedQuantity - line.receivedQuantity}</span><input aria-label={`${index + 1}. ürün teslim miktarı`} inputMode="numeric" value={quantities[line.id] ?? "0"} onChange={event => { props.onDirtyChange?.(true); setQuantities(current => Object.freeze({ ...current, [line.id]: event.target.value })); }} /></label>)}<button className={styles.primary} type="submit">Seçilen miktarları teslim al</button></fieldset></form>;
}
