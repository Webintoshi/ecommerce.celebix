"use client";

import type { InventoryTransfer, InventoryTransferStatus } from "@celebix/saas-contracts";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { PanelPageHeader, PanelPageShell, PanelStatusBadge } from "@/components/panel/PanelPageShell";
import { inventoryApi } from "@/lib/inventory-ui/client";
import { createInventoryConsoleLifecycle, createInventoryTransferConsoleController, type InventoryConsoleSnapshot } from "@/lib/inventory-ui/console-controller";
import { InventoryListState, useInventoryCollection, type InventoryListPhase } from "./InventoryListState";
import { InventoryOperationForm } from "./InventoryOperationForm";
import styles from "./inventory-console.module.css";
import { InventoryLocationConsole } from "./InventoryLocationConsole";

const LABELS: Readonly<Record<InventoryTransferStatus, string>> = Object.freeze({ draft: "Taslak", in_transit: "Yolda", received: "Teslim alındı", cancelled: "İptal" });
const date = (value: string) => new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
const number = (id: string) => `TR-${id.slice(0, 8).toUpperCase()}`;
const identity = (id: string) => id;
const quantity = (item: InventoryTransfer) => item.lines.reduce((sum, line) => sum + line.quantity, 0);
const tone = (status: InventoryTransferStatus) => status === "received" ? "success" : status === "cancelled" ? "danger" : status === "in_transit" ? "warning" : "neutral";

export function InventoryTransferListPresentation(props: Readonly<{ state: InventoryListPhase; items: readonly InventoryTransfer[]; error: string; canManage?: boolean; onRetry: () => void }>) {
  return <>{props.canManage ? <Link className={styles.createAction} href="/products/transfers/new">Yeni stok transferi</Link> : null}<InventoryListState state={props.state} count={props.items.length} error={props.error} emptyTitle="Stok transferi yok" emptyDescription="Kalıcı konum transferleri burada görünecek." onRetry={props.onRetry}><div className={styles.desktopTable}><table aria-label="Stok transferleri"><thead><tr><th>Numara</th><th>Kaynak</th><th>Hedef</th><th>Durum</th><th>Kalem</th><th>Miktar</th><th>Güncellendi</th></tr></thead><tbody>{props.items.map((item) => <tr key={item.id}><td><Link href={`/products/transfers/${item.id}`}>{number(item.id)}</Link></td><td><code>{identity(item.sourceLocationId)}</code></td><td><code>{identity(item.destinationLocationId)}</code></td><td><PanelStatusBadge tone={tone(item.status)}>{LABELS[item.status]}</PanelStatusBadge></td><td>{item.lines.length}</td><td>{quantity(item)}</td><td>{date(item.updatedAt)}</td></tr>)}</tbody></table></div><div className={styles.mobileCards}>{props.items.map((item) => <article className={styles.mobileCard} key={item.id}><div className={styles.cardHeading}><Link className={styles.mobileRecordLink} href={`/products/transfers/${item.id}`}>{number(item.id)}</Link><PanelStatusBadge tone={tone(item.status)}>{LABELS[item.status]}</PanelStatusBadge></div><dl><div><dt>Kaynak</dt><dd>{identity(item.sourceLocationId)}</dd></div><div><dt>Hedef</dt><dd>{identity(item.destinationLocationId)}</dd></div><div><dt>Kalem</dt><dd>{item.lines.length}</dd></div><div><dt>Miktar</dt><dd>{quantity(item)}</dd></div><div><dt>Güncellendi</dt><dd>{date(item.updatedAt)}</dd></div><div><dt>Sürüm</dt><dd>{item.version}</dd></div></dl></article>)}</div></InventoryListState></>;
}

export function InventoryTransferPresentation(props: Readonly<{ state: InventoryConsoleSnapshot<InventoryTransfer>; canManage: boolean; onDispatch: () => void; onReceive: () => void; onCancel: () => void }>) {
  const item = props.state.record;
  if (props.state.phase === "denied") return <div className={styles.denied} role="status">Bu stok transferini görüntüleme yetkiniz yok.</div>;
  if (!item) return <div className={props.state.phase === "error" ? styles.error : styles.state} role={props.state.phase === "error" ? "alert" : "status"}>{props.state.message || "Stok transferi yükleniyor…"}</div>;
  return <><div className={styles.detailSummary}><div><span>Transfer</span><strong>{number(item.id)}</strong></div><div><span>Kaynak</span><code>{item.sourceLocationId}</code></div><div><span>Hedef</span><code>{item.destinationLocationId}</code></div><div><span>Sürüm</span><strong>Sürüm {item.version}</strong></div><div><span>Durum</span><PanelStatusBadge tone={tone(item.status)}>{LABELS[item.status]}</PanelStatusBadge></div></div>{props.state.message ? <p className={props.state.phase === "conflict" ? styles.conflict : props.state.phase === "error" || props.state.phase === "verification_unavailable" ? styles.errorNotice : styles.notice} role={props.state.phase === "conflict" || props.state.phase === "error" || props.state.phase === "verification_unavailable" ? "alert" : "status"}>{props.state.message}</p> : null}<div className={styles.lineTable}><table aria-label="Transfer kalemleri"><thead><tr><th>Kalem</th><th>Varyant</th><th>Miktar</th></tr></thead><tbody>{item.lines.map((line) => <tr key={line.id}><td><code>{line.id}</code></td><td><code>{line.variantId}</code></td><td>{line.quantity}</td></tr>)}</tbody></table></div>{props.canManage ? <div className={styles.actions}>{item.status === "draft" ? <button className={styles.primary} type="button" disabled={props.state.pending || props.state.locked} onClick={props.onDispatch}>Sevk et</button> : null}{item.status === "in_transit" ? <button className={styles.primary} type="button" disabled={props.state.pending || props.state.locked} onClick={props.onReceive}>Teslim al</button> : null}{["draft", "in_transit"].includes(item.status) ? <button type="button" disabled={props.state.pending || props.state.locked} onClick={props.onCancel}>İptal et</button> : null}</div> : null}</>;
}

function InventoryTransferDetail(props: Readonly<{ initial?: InventoryTransfer; resourceId?: string; create?: boolean; canRead: boolean; canManage: boolean }>) {
  const lifecycle = useRef<ReturnType<typeof createInventoryConsoleLifecycle<ReturnType<typeof createInventoryTransferConsoleController>>> | null>(null);
  const [state, setState] = useState<InventoryConsoleSnapshot<InventoryTransfer>>({ phase: props.canRead ? (props.initial ? "loaded" : "loading") : "denied", ...(props.initial ? { record: props.initial } : {}), pending: false, locked: false, message: "" });
  if (!lifecycle.current) lifecycle.current = createInventoryConsoleLifecycle(() => createInventoryTransferConsoleController({ initial: props.initial, resourceId: props.resourceId, canRead: props.canRead, canManage: props.canManage, api: inventoryApi, onChange: setState }));
  useEffect(() => lifecycle.current!.setup(), []);
  const item = state.record;
  return <>{item ? <InventoryTransferPresentation state={state} canManage={props.canManage} onDispatch={() => { void lifecycle.current?.getCurrent()?.dispatch(); }} onReceive={() => { void lifecycle.current?.getCurrent()?.receive(); }} onCancel={() => { void lifecycle.current?.getCurrent()?.cancel(); }} /> : null}
    {(props.create || item?.status === "draft") ? <InventoryOperationForm mode="transfer" record={item} canManage={props.canManage} phase={state.phase} pending={state.pending} locked={state.locked} message={state.message} onSave={(value) => { void lifecycle.current?.getCurrent()?.save(value as Parameters<ReturnType<typeof createInventoryTransferConsoleController>["save"]>[0]); }} /> : null}
  </>;
}

export function InventoryTransferConsole(props: Readonly<{ mode?: "list" | "new" | "detail"; initial?: InventoryTransfer; initialItems?: readonly InventoryTransfer[]; resourceId?: string; canRead?: boolean; canManage: boolean }>) {
  const canRead = props.canRead ?? true, load = useCallback((signal?: AbortSignal) => inventoryApi.listTransfers(signal), []), mode = props.mode ?? (props.initial || props.resourceId ? "detail" : "list"), detail = mode !== "list", list = useInventoryCollection({ enabled: !detail, canRead, initial: props.initialItems, load });
  return <PanelPageShell><PanelPageHeader title={mode === "new" ? "Yeni stok transferi" : detail ? "Stok transferi ayrıntısı" : "Stok transferleri"} description="Konumlar arası stok hareketlerini kalıcı sürümlerle izleyin." />{detail ? <InventoryTransferDetail initial={props.initial} resourceId={props.resourceId} create={mode === "new"} canRead={canRead} canManage={props.canManage} /> : <><InventoryLocationConsole canRead={canRead} canManage={props.canManage} /><InventoryTransferListPresentation state={list.phase} items={list.items} error={list.error} canManage={props.canManage} onRetry={list.retry} /></>}</PanelPageShell>;
}
