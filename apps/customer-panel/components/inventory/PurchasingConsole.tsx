"use client";

import type { PurchaseOrder, PurchaseOrderStatus } from "@celebix/saas-contracts";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { PanelActionButton, PanelPageHeader, PanelPageShell, PanelStatusBadge } from "@/components/panel/PanelPageShell";
import { inventoryApi } from "@/lib/inventory-ui/client";
import { createInventoryConsoleLifecycle, createPurchasingConsoleController, type InventoryConsoleSnapshot } from "@/lib/inventory-ui/console-controller";
import { InventoryListState, useInventoryCollection, type InventoryListPhase } from "./InventoryListState";
import { InventoryOperationForm, PurchaseReceiptForm } from "./InventoryOperationForm";
import { useOptionalInventoryWorkspace } from "./InventoryWorkspaceContext";
import type { InventoryConsoleActivity } from "./InventoryOperationForm";
import styles from "./inventory-console.module.css";

const LABELS: Readonly<Record<PurchaseOrderStatus, string>> = Object.freeze({ draft: "Taslak", ordered: "Sipariş verildi", partially_received: "Kısmen teslim", received: "Teslim alındı", cancelled: "İptal" });
const money = (cents: number) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(cents / 100);
const date = (value: string) => new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
const number = (id: string) => `ST-${id.slice(0, 8).toUpperCase()}`;
const tone = (status: PurchaseOrderStatus) => status === "received" ? "success" : status === "cancelled" ? "danger" : "neutral";

export function PurchasingListPresentation(props: Readonly<{ state: InventoryListPhase; items: readonly PurchaseOrder[]; error: string; canManage?: boolean; onRetry: () => void }>) {
  const workspace = useOptionalInventoryWorkspace();
  const locationName = (id: string) => workspace?.locationName(id) ?? "Depo bilgisi yüklenemedi";
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const query = search.trim().toLocaleLowerCase("tr-TR");
  const visibleItems = props.items.filter((item) => (!status || item.status === status) && (!query || [number(item.id), item.supplierName, locationName(item.locationId), item.locationId].some((value) => value.toLocaleLowerCase("tr-TR").includes(query))));
  return <InventoryListState state={props.state} count={props.items.length} error={props.error} emptyTitle="Satın alma kaydı yok" emptyDescription="Kalıcı satın alma siparişleri burada görünecek." onRetry={props.onRetry}>
    <div className={styles.listToolbar}>
      <label className={styles.searchField}><span className={styles.srOnly}>Kayıt ara</span><input type="search" value={search} placeholder="Kayıt ara" onChange={(event) => setSearch(event.currentTarget.value)} /></label>
      <label className={styles.statusFilter}><span className={styles.srOnly}>Durum</span><select value={status} onChange={(event) => setStatus(event.currentTarget.value)}><option value="">Tüm durumlar</option>{Object.entries(LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
      <span className={styles.resultCount} role="status">{visibleItems.length} / {props.items.length} kayıt</span>
      {search || status ? <button type="button" onClick={() => { setSearch(""); setStatus(""); }}>Temizle</button> : null}
    </div>
    {!visibleItems.length ? <p className={styles.state}>Eşleşen kayıt yok. Aramanızı veya durum seçiminizi değiştirin.</p> : null}
    <div className={styles.desktopTable} hidden={!visibleItems.length}><table aria-label="Satın alma siparişleri"><thead><tr><th>Numara</th><th>Tedarikçi</th><th>Durum</th><th>Sipariş</th><th>Teslim</th><th>Toplam</th><th>Güncellendi</th></tr></thead><tbody>{visibleItems.map((item) => {
      const ordered = item.lines.reduce((sum, line) => sum + line.orderedQuantity, 0), received = item.lines.reduce((sum, line) => sum + line.receivedQuantity, 0);
      return <tr key={item.id}><td><Link href={`/products/stock?tab=purchases&kind=purchase&id=${item.id}`}>{number(item.id)}</Link></td><td>{item.supplierName}</td><td><PanelStatusBadge tone={tone(item.status)}>{LABELS[item.status]}</PanelStatusBadge></td><td>{ordered}</td><td>{received}</td><td>{money(item.totalCostCents)}</td><td>{date(item.updatedAt)}</td></tr>;
    })}</tbody></table></div>
    <div className={styles.mobileCards} hidden={!visibleItems.length}>{visibleItems.map((item) => <article className={styles.mobileCard} key={item.id}><div className={styles.cardHeading}><Link className={styles.mobileRecordLink} href={`/products/stock?tab=purchases&kind=purchase&id=${item.id}`}>{number(item.id)}</Link><PanelStatusBadge tone={tone(item.status)}>{LABELS[item.status]}</PanelStatusBadge></div><dl><div><dt>Tedarikçi</dt><dd>{item.supplierName}</dd></div><div><dt>Konum</dt><dd>{locationName(item.locationId)}</dd></div><div><dt>Sipariş</dt><dd>{item.lines.reduce((sum, line) => sum + line.orderedQuantity, 0)}</dd></div><div><dt>Teslim</dt><dd>{item.lines.reduce((sum, line) => sum + line.receivedQuantity, 0)}</dd></div><div><dt>Toplam</dt><dd>{money(item.totalCostCents)}</dd></div><div><dt>Güncellendi</dt><dd>{date(item.updatedAt)}</dd></div></dl></article>)}</div>
  </InventoryListState>;
}

export function PurchasingDetailPresentation(props: Readonly<{ state: InventoryConsoleSnapshot<PurchaseOrder>; canManage: boolean; hasUnsavedChanges?: boolean; onOrder: () => void; onCancel: () => void }>) {
  const workspace = useOptionalInventoryWorkspace();
  const locationName = (id: string) => workspace?.locationName(id) ?? "Depo bilgisi yüklenemedi";
  const variantName = (id: string) => workspace?.variantName(id) ?? "Ürün bilgisi yüklenemedi";
  const item = props.state.record;
  if (props.state.phase === "denied") return <div className={styles.denied} role="status">Bu satın alma kaydını görüntüleme yetkiniz yok.</div>;
  if (!item) return <div className={props.state.phase === "error" ? styles.error : styles.state} role={props.state.phase === "error" ? "alert" : "status"}>{props.state.message || "Satın alma kaydı yükleniyor…"}</div>;
  return <><div className={styles.detailSummary}><div><span>Sipariş</span><strong>{number(item.id)}</strong></div><div><span>Tedarikçi</span><strong>{item.supplierName}</strong></div><div><span>Depo</span><strong>{locationName(item.locationId)}</strong></div><div><span>Durum</span><PanelStatusBadge tone={tone(item.status)}>{LABELS[item.status]}</PanelStatusBadge></div></div>
    {props.state.message ? <p className={props.state.phase === "conflict" ? styles.conflict : props.state.phase === "error" || props.state.phase === "verification_unavailable" ? styles.errorNotice : styles.notice} role={props.state.phase === "conflict" || props.state.phase === "error" || props.state.phase === "verification_unavailable" ? "alert" : "status"}>{props.state.message}</p> : null}
    <div className={styles.lineTable} role="region" tabIndex={0} aria-label="İşlem kalemleri"><table aria-label="Satın alma kalemleri"><thead><tr><th>Ürün / Varyant</th><th>Sipariş</th><th>Teslim</th><th>Birim maliyet</th></tr></thead><tbody>{item.lines.map((line) => <tr key={line.id}><td>{variantName(line.variantId)}</td><td>{line.orderedQuantity}</td><td>{line.receivedQuantity}</td><td>{money(line.unitCostCents)}</td></tr>)}</tbody></table></div><details className={styles.recordInformation}><summary>İşlem bilgisi</summary><dl><div><dt>Kayıt kimliği</dt><dd><code>{item.id}</code></dd></div><div><dt>Sürüm</dt><dd>{item.version}</dd></div><div><dt>Depo kimliği</dt><dd><code>{item.locationId}</code></dd></div>{item.lines.map((line, index) => <div key={line.id}><dt>{index + 1}. kalem kimliği</dt><dd><code>{line.id}</code> · <code>{line.variantId}</code></dd></div>)}</dl></details>
    {props.canManage ? <div className={styles.actions}>{item.status === "draft" ? <button className={styles.primary} type="button" disabled={props.state.pending || props.state.locked || props.hasUnsavedChanges} onClick={props.onOrder}>Siparişi ver</button> : null}{["draft", "ordered"].includes(item.status) ? <button type="button" disabled={props.state.pending || props.state.locked} onClick={props.onCancel}>İptal et</button> : null}</div> : null}</>;
}

function PurchasingDetail(props: Readonly<{ initial?: PurchaseOrder; resourceId?: string; create?: boolean; canRead: boolean; canManage: boolean; initialLocationId?: string; initialVariantId?: string; onStateChange?(state: InventoryConsoleActivity): void }>) {
  const [dirty, setDirty] = useState(false);
  const lifecycle = useRef<ReturnType<typeof createInventoryConsoleLifecycle<ReturnType<typeof createPurchasingConsoleController>>> | null>(null);
  const [state, setState] = useState<InventoryConsoleSnapshot<PurchaseOrder>>({ phase: props.canRead ? (props.initial ? "loaded" : "loading") : "denied", ...(props.initial ? { record: props.initial } : {}), pending: false, locked: false, message: "" });
  if (!lifecycle.current) lifecycle.current = createInventoryConsoleLifecycle(() => createPurchasingConsoleController({ initial: props.initial, resourceId: props.resourceId, canRead: props.canRead, canManage: props.canManage, api: inventoryApi, onChange: setState }));
  useEffect(() => lifecycle.current!.setup(), []);
  const item = state.record;
  useEffect(() => { props.onStateChange?.({ pending: state.pending, locked: state.locked, dirty }); }, [state.pending, state.locked, dirty, props.onStateChange]);
  return <>{!props.create || item ? <PurchasingDetailPresentation state={state} canManage={props.canManage} hasUnsavedChanges={dirty} onOrder={() => { void lifecycle.current?.getCurrent()?.order(); }} onCancel={() => { void lifecycle.current?.getCurrent()?.cancel(); }} /> : null}
    {((props.create && !item) || item?.status === "draft") ? <InventoryOperationForm mode="purchase" record={item} initialLocationId={props.initialLocationId} initialVariantId={props.initialVariantId} onDirtyChange={setDirty} canManage={props.canManage} phase={state.phase} pending={state.pending} locked={state.locked} message={state.message} onSave={(value) => { void lifecycle.current?.getCurrent()?.save(value as Parameters<ReturnType<typeof createPurchasingConsoleController>["save"]>[0]); }} /> : null}
    {item && (item.status === "ordered" || item.status === "partially_received") && props.canManage ? <PurchaseReceiptForm key={`${item.id}:${item.version}`} record={item} pending={state.pending} locked={state.locked} onDirtyChange={setDirty} onReceive={(lines) => { void lifecycle.current?.getCurrent()?.receive(lines); }} /> : null}
  </>;
}

export function PurchasingConsole(props: Readonly<{ mode?: "list" | "new" | "detail"; initial?: PurchaseOrder; initialItems?: readonly PurchaseOrder[]; resourceId?: string; canRead?: boolean; canManage: boolean; embedded?: boolean; initialLocationId?: string; initialVariantId?: string; onStateChange?(state: InventoryConsoleActivity): void }>) {
  const canRead = props.canRead ?? true;
  const load = useCallback((signal?: AbortSignal) => inventoryApi.listPurchaseOrders(signal), []);
  const mode = props.mode ?? (props.initial || props.resourceId ? "detail" : "list");
  const detail = mode !== "list";
  const list = useInventoryCollection({ enabled: !detail, canRead, initial: props.initialItems, load });
  const title = mode === "new" ? "Yeni satın alma siparişi" : detail ? "Satın alma ayrıntısı" : "Satın alma";
  return <PanelPageShell embedded={props.embedded}><PanelPageHeader embedded={props.embedded} title={title} description="Tedarikçiden sipariş verin ve gelen ürünleri teslim alın." actions={!props.embedded && mode === "list" && props.canManage ? <span className={styles.pageAction}><PanelActionButton primary href="/products/stock?tab=purchases&kind=purchase&new=1">Yeni satın alma siparişi</PanelActionButton></span> : undefined} />{!props.embedded ? <h1 className={styles.srOnly}>{title}</h1> : null}{detail ? <PurchasingDetail initial={props.initial} resourceId={props.resourceId} create={mode === "new"} canRead={canRead} canManage={props.canManage} initialLocationId={props.initialLocationId} initialVariantId={props.initialVariantId} onStateChange={props.onStateChange} /> : <PurchasingListPresentation state={list.phase} items={list.items} error={list.error} canManage={props.canManage} onRetry={list.retry} />}</PanelPageShell>;
}
