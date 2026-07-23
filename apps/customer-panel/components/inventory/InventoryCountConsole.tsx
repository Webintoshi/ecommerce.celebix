"use client";

import type { InventoryCount, InventoryCountStatus } from "@celebix/saas-contracts";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { PanelPageHeader, PanelPageShell, PanelStatusBadge } from "@/components/panel/PanelPageShell";
import { inventoryApi } from "@/lib/inventory-ui/client";
import { createInventoryConsoleLifecycle, createInventoryCountConsoleController, type InventoryConsoleSnapshot } from "@/lib/inventory-ui/console-controller";
import { InventoryListState, useInventoryCollection, type InventoryListPhase } from "./InventoryListState";
import { InventoryOperationForm } from "./InventoryOperationForm";
import styles from "./inventory-console.module.css";

const LABELS: Readonly<Record<InventoryCountStatus, string>> = Object.freeze({ draft: "Taslak", counting: "Sayılıyor", committed: "Tamamlandı", cancelled: "İptal" });
const date = (value: string) => new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
const name = (id: string) => `Sayım ${id.slice(0, 8).toUpperCase()}`;
const location = (id: string) => id;
const tone = (status: InventoryCountStatus) => status === "committed" ? "success" : status === "cancelled" ? "danger" : status === "counting" ? "warning" : "neutral";
const variance = (item: InventoryCount) => item.lines.some((line) => line.countedQuantity === undefined) ? null : item.lines.reduce((sum, line) => sum + line.countedQuantity! - line.expectedQuantity, 0);

export function InventoryCountListPresentation(props: Readonly<{ state: InventoryListPhase; items: readonly InventoryCount[]; error: string; canManage?: boolean; onRetry: () => void }>) {
  return <>{props.canManage ? <Link className={styles.createAction} href="/products/inventory-counts/new">Yeni stok sayımı</Link> : null}<InventoryListState state={props.state} count={props.items.length} error={props.error} emptyTitle="Stok sayımı yok" emptyDescription="Kalıcı stok sayımları burada görünecek." onRetry={props.onRetry}><div className={styles.desktopTable}><table aria-label="Stok sayımları"><thead><tr><th>Ad</th><th>Konum</th><th>Durum</th><th>Kalem</th><th>Fark</th><th>Güncellendi</th></tr></thead><tbody>{props.items.map((item) => <tr key={item.id}><td><Link href={`/products/inventory-counts/${item.id}`}>{name(item.id)}</Link></td><td><code>{location(item.locationId)}</code></td><td><PanelStatusBadge tone={tone(item.status)}>{LABELS[item.status]}</PanelStatusBadge></td><td>{item.lines.length}</td><td>{variance(item) ?? "Bekliyor"}</td><td>{date(item.updatedAt)}</td></tr>)}</tbody></table></div><div className={styles.mobileCards}>{props.items.map((item) => <article className={styles.mobileCard} key={item.id}><div className={styles.cardHeading}><Link className={styles.mobileRecordLink} href={`/products/inventory-counts/${item.id}`}>{name(item.id)}</Link><PanelStatusBadge tone={tone(item.status)}>{LABELS[item.status]}</PanelStatusBadge></div><dl><div><dt>Konum</dt><dd>{location(item.locationId)}</dd></div><div><dt>Kalem</dt><dd>{item.lines.length}</dd></div><div><dt>Fark</dt><dd>{variance(item) ?? "Bekliyor"}</dd></div><div><dt>Güncellendi</dt><dd>{date(item.updatedAt)}</dd></div><div><dt>Sürüm</dt><dd>{item.version}</dd></div></dl></article>)}</div></InventoryListState></>;
}

export function InventoryCountPresentation(props: Readonly<{ state: InventoryConsoleSnapshot<InventoryCount>; canManage: boolean; onStart: () => void; onCommit: () => void; onCancel: () => void }>) {
  const item = props.state.record;
  if (props.state.phase === "denied") return <div className={styles.denied} role="status">Bu stok sayımını görüntüleme yetkiniz yok.</div>;
  if (!item) return <div className={props.state.phase === "error" ? styles.error : styles.state} role={props.state.phase === "error" ? "alert" : "status"}>{props.state.message || "Stok sayımı yükleniyor…"}</div>;
  return <><div className={styles.detailSummary}><div><span>Sayım</span><strong>{name(item.id)}</strong></div><div><span>Konum</span><code>{item.locationId}</code></div><div><span>Sürüm</span><strong>Sürüm {item.version}</strong></div><div><span>Durum</span><PanelStatusBadge tone={tone(item.status)}>{LABELS[item.status]}</PanelStatusBadge></div></div>{props.state.message ? <p className={props.state.phase === "conflict" ? styles.conflict : props.state.phase === "error" || props.state.phase === "verification_unavailable" ? styles.errorNotice : styles.notice} role={props.state.phase === "conflict" || props.state.phase === "error" || props.state.phase === "verification_unavailable" ? "alert" : "status"}>{props.state.message}</p> : null}<div className={styles.lineTable}><table aria-label="Sayım kalemleri"><thead><tr><th>Kalemler</th><th>Varyant</th><th>Beklenen</th><th>Sayılan</th><th>Fark</th></tr></thead><tbody>{item.lines.map((line) => <tr key={line.id}><td><code>{line.id}</code></td><td><code>{line.variantId}</code></td><td>{line.expectedQuantity}</td><td>{line.countedQuantity ?? "Bekliyor"}</td><td>{line.countedQuantity === undefined ? "Bekliyor" : line.countedQuantity - line.expectedQuantity}</td></tr>)}</tbody></table></div>{props.canManage ? <div className={styles.actions}>{item.status === "draft" ? <button className={styles.primary} type="button" disabled={props.state.pending || props.state.locked} onClick={props.onStart}>Sayımı başlat</button> : null}{item.status === "counting" ? <button className={styles.primary} type="button" disabled={props.state.pending || props.state.locked} onClick={props.onCommit}>Sayımı tamamla</button> : null}{["draft", "counting"].includes(item.status) ? <button type="button" disabled={props.state.pending || props.state.locked} onClick={props.onCancel}>İptal et</button> : null}</div> : null}</>;
}

function InventoryCountDetail(props: Readonly<{ initial?: InventoryCount; resourceId?: string; create?: boolean; canRead: boolean; canManage: boolean }>) {
  const lifecycle = useRef<ReturnType<typeof createInventoryConsoleLifecycle<ReturnType<typeof createInventoryCountConsoleController>>> | null>(null);
  const [state, setState] = useState<InventoryConsoleSnapshot<InventoryCount>>({ phase: props.canRead ? (props.initial ? "loaded" : "loading") : "denied", ...(props.initial ? { record: props.initial } : {}), pending: false, locked: false, message: "" });
  if (!lifecycle.current) lifecycle.current = createInventoryConsoleLifecycle(() => createInventoryCountConsoleController({ initial: props.initial, resourceId: props.resourceId, canRead: props.canRead, canManage: props.canManage, api: inventoryApi, onChange: setState }));
  useEffect(() => lifecycle.current!.setup(), []);
  const item = state.record;
  return <>{item ? <InventoryCountPresentation state={state} canManage={props.canManage} onStart={() => { void lifecycle.current?.getCurrent()?.start(); }} onCommit={() => { void lifecycle.current?.getCurrent()?.commit(); }} onCancel={() => { void lifecycle.current?.getCurrent()?.cancel(); }} /> : null}
    {(props.create || item?.status === "draft") ? <InventoryOperationForm mode="count" record={item} canManage={props.canManage} phase={state.phase} pending={state.pending} locked={state.locked} message={state.message} onSave={(value) => { void lifecycle.current?.getCurrent()?.save(value as Parameters<ReturnType<typeof createInventoryCountConsoleController>["save"]>[0]); }} /> : null}
  </>;
}

export function InventoryCountConsole(props: Readonly<{ mode?: "list" | "new" | "detail"; initial?: InventoryCount; initialItems?: readonly InventoryCount[]; resourceId?: string; canRead?: boolean; canManage: boolean }>) {
  const canRead = props.canRead ?? true, load = useCallback((signal?: AbortSignal) => inventoryApi.listCounts(signal), []), mode = props.mode ?? (props.initial || props.resourceId ? "detail" : "list"), detail = mode !== "list", list = useInventoryCollection({ enabled: !detail, canRead, initial: props.initialItems, load });
  return <PanelPageShell><PanelPageHeader title={mode === "new" ? "Yeni stok sayımı" : detail ? "Stok sayımı ayrıntısı" : "Stok sayımları"} description="Sayım farklarını kalıcı konum kayıtları üzerinden izleyin." />{detail ? <InventoryCountDetail initial={props.initial} resourceId={props.resourceId} create={mode === "new"} canRead={canRead} canManage={props.canManage} /> : <InventoryCountListPresentation state={list.phase} items={list.items} error={list.error} canManage={props.canManage} onRetry={list.retry} />}</PanelPageShell>;
}
