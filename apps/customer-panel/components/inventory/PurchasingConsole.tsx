"use client";

import type { PurchaseOrder, PurchaseOrderStatus } from "@celebix/saas-contracts";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { PanelPageHeader, PanelPageShell, PanelStatusBadge } from "@/components/panel/PanelPageShell";
import { inventoryApi } from "@/lib/inventory-ui/client";
import { createInventoryConsoleLifecycle, createPurchasingConsoleController, type InventoryConsoleSnapshot } from "@/lib/inventory-ui/console-controller";
import { InventoryListState, useInventoryCollection, type InventoryListPhase } from "./InventoryListState";
import { InventoryOperationForm, PurchaseReceiptForm } from "./InventoryOperationForm";
import styles from "./inventory-console.module.css";

const LABELS: Readonly<Record<PurchaseOrderStatus, string>> = Object.freeze({ draft: "Taslak", ordered: "Sipariş verildi", partially_received: "Kısmen teslim", received: "Teslim alındı", cancelled: "İptal" });
const money = (cents: number) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(cents / 100);
const date = (value: string) => new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
const number = (id: string) => `ST-${id.slice(0, 8).toUpperCase()}`;
const tone = (status: PurchaseOrderStatus) => status === "received" ? "success" : status === "cancelled" ? "danger" : status === "draft" ? "neutral" : "warning";

export function PurchasingListPresentation(props: Readonly<{ state: InventoryListPhase; items: readonly PurchaseOrder[]; error: string; canManage?: boolean; onRetry: () => void }>) {
  return <>{props.canManage ? <Link className={styles.createAction} href="/products/purchasing/new">Yeni satın alma siparişi</Link> : null}<InventoryListState state={props.state} count={props.items.length} error={props.error} emptyTitle="Satın alma kaydı yok" emptyDescription="Kalıcı satın alma siparişleri burada görünecek." onRetry={props.onRetry}>
    <div className={styles.desktopTable}><table aria-label="Satın alma siparişleri"><thead><tr><th>Numara</th><th>Tedarikçi</th><th>Durum</th><th>Sipariş</th><th>Teslim</th><th>Toplam</th><th>Güncellendi</th></tr></thead><tbody>{props.items.map((item) => {
      const ordered = item.lines.reduce((sum, line) => sum + line.orderedQuantity, 0), received = item.lines.reduce((sum, line) => sum + line.receivedQuantity, 0);
      return <tr key={item.id}><td><Link href={`/products/purchasing/${item.id}`}>{number(item.id)}</Link></td><td>{item.supplierName}</td><td><PanelStatusBadge tone={tone(item.status)}>{LABELS[item.status]}</PanelStatusBadge></td><td>{ordered}</td><td>{received}</td><td>{money(item.totalCostCents)}</td><td>{date(item.updatedAt)}</td></tr>;
    })}</tbody></table></div>
    <div className={styles.mobileCards}>{props.items.map((item) => <article className={styles.mobileCard} key={item.id}><div className={styles.cardHeading}><Link className={styles.mobileRecordLink} href={`/products/purchasing/${item.id}`}>{number(item.id)}</Link><PanelStatusBadge tone={tone(item.status)}>{LABELS[item.status]}</PanelStatusBadge></div><dl><div><dt>Tedarikçi</dt><dd>{item.supplierName}</dd></div><div><dt>Konum</dt><dd>{item.locationId}</dd></div><div><dt>Sipariş</dt><dd>{item.lines.reduce((sum, line) => sum + line.orderedQuantity, 0)}</dd></div><div><dt>Teslim</dt><dd>{item.lines.reduce((sum, line) => sum + line.receivedQuantity, 0)}</dd></div><div><dt>Toplam</dt><dd>{money(item.totalCostCents)}</dd></div><div><dt>Güncellendi</dt><dd>{date(item.updatedAt)}</dd></div><div><dt>Sürüm</dt><dd>{item.version}</dd></div></dl></article>)}</div>
  </InventoryListState></>;
}

export function PurchasingDetailPresentation(props: Readonly<{ state: InventoryConsoleSnapshot<PurchaseOrder>; canManage: boolean; onOrder: () => void; onCancel: () => void }>) {
  const item = props.state.record;
  if (props.state.phase === "denied") return <div className={styles.denied} role="status">Bu satın alma kaydını görüntüleme yetkiniz yok.</div>;
  if (!item) return <div className={props.state.phase === "error" ? styles.error : styles.state} role={props.state.phase === "error" ? "alert" : "status"}>{props.state.message || "Satın alma kaydı yükleniyor…"}</div>;
  return <><div className={styles.detailSummary}><div><span>Sipariş</span><strong>{number(item.id)}</strong></div><div><span>Tedarikçi</span><strong>{item.supplierName}</strong></div><div><span>Konum</span><code>{item.locationId}</code></div><div><span>Sürüm</span><strong>Sürüm {item.version}</strong></div><div><span>Durum</span><PanelStatusBadge tone={tone(item.status)}>{LABELS[item.status]}</PanelStatusBadge></div></div>
    {props.state.message ? <p className={props.state.phase === "conflict" ? styles.conflict : props.state.phase === "error" || props.state.phase === "verification_unavailable" ? styles.errorNotice : styles.notice} role={props.state.phase === "conflict" || props.state.phase === "error" || props.state.phase === "verification_unavailable" ? "alert" : "status"}>{props.state.message}</p> : null}
    <div className={styles.lineTable}><table aria-label="Satın alma kalemleri"><thead><tr><th>Kalem</th><th>Varyant</th><th>Sipariş</th><th>Teslim</th><th>Birim maliyet</th></tr></thead><tbody>{item.lines.map((line) => <tr key={line.id}><td><code>{line.id}</code></td><td><code>{line.variantId}</code></td><td>{line.orderedQuantity}</td><td>{line.receivedQuantity}</td><td>{money(line.unitCostCents)}</td></tr>)}</tbody></table></div>
    {props.canManage ? <div className={styles.actions}>{item.status === "draft" ? <button className={styles.primary} type="button" disabled={props.state.pending || props.state.locked} onClick={props.onOrder}>Siparişi ver</button> : null}{["draft", "ordered", "partially_received"].includes(item.status) ? <button type="button" disabled={props.state.pending || props.state.locked} onClick={props.onCancel}>İptal et</button> : null}</div> : null}</>;
}

function PurchasingDetail(props: Readonly<{ initial?: PurchaseOrder; resourceId?: string; create?: boolean; canRead: boolean; canManage: boolean }>) {
  const lifecycle = useRef<ReturnType<typeof createInventoryConsoleLifecycle<ReturnType<typeof createPurchasingConsoleController>>> | null>(null);
  const [state, setState] = useState<InventoryConsoleSnapshot<PurchaseOrder>>({ phase: props.canRead ? (props.initial ? "loaded" : "loading") : "denied", ...(props.initial ? { record: props.initial } : {}), pending: false, locked: false, message: "" });
  if (!lifecycle.current) lifecycle.current = createInventoryConsoleLifecycle(() => createPurchasingConsoleController({ initial: props.initial, resourceId: props.resourceId, canRead: props.canRead, canManage: props.canManage, api: inventoryApi, onChange: setState }));
  useEffect(() => lifecycle.current!.setup(), []);
  const item = state.record;
  return <>{item ? <PurchasingDetailPresentation state={state} canManage={props.canManage} onOrder={() => { void lifecycle.current?.getCurrent()?.order(); }} onCancel={() => { void lifecycle.current?.getCurrent()?.cancel(); }} /> : null}
    {(props.create || item?.status === "draft") ? <InventoryOperationForm mode="purchase" record={item} canManage={props.canManage} phase={state.phase} pending={state.pending} locked={state.locked} message={state.message} onSave={(value) => { void lifecycle.current?.getCurrent()?.save(value as Parameters<ReturnType<typeof createPurchasingConsoleController>["save"]>[0]); }} /> : null}
    {item && (item.status === "ordered" || item.status === "partially_received") && props.canManage ? <PurchaseReceiptForm key={`${item.id}:${item.version}`} record={item} pending={state.pending} locked={state.locked} onReceive={(lines) => { void lifecycle.current?.getCurrent()?.receive(lines); }} /> : null}
  </>;
}

export function PurchasingConsole(props: Readonly<{ mode?: "list" | "new" | "detail"; initial?: PurchaseOrder; initialItems?: readonly PurchaseOrder[]; resourceId?: string; canRead?: boolean; canManage: boolean }>) {
  const canRead = props.canRead ?? true;
  const load = useCallback((signal?: AbortSignal) => inventoryApi.listPurchaseOrders(signal), []);
  const mode = props.mode ?? (props.initial || props.resourceId ? "detail" : "list");
  const detail = mode !== "list";
  const list = useInventoryCollection({ enabled: !detail, canRead, initial: props.initialItems, load });
  return <PanelPageShell><PanelPageHeader title={mode === "new" ? "Yeni satın alma siparişi" : detail ? "Satın alma ayrıntısı" : "Satın alma"} description="Sipariş ve teslim hareketlerini kalıcı envanter kayıtlarıyla yönetin." />{detail ? <PurchasingDetail initial={props.initial} resourceId={props.resourceId} create={mode === "new"} canRead={canRead} canManage={props.canManage} /> : <PurchasingListPresentation state={list.phase} items={list.items} error={list.error} canManage={props.canManage} onRetry={list.retry} />}</PanelPageShell>;
}
