"use client";

import type { InventoryTransfer, InventoryTransferStatus } from "@celebix/saas-contracts";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { PanelActionButton, PanelPageHeader, PanelPageShell, PanelStatusBadge } from "@/components/panel/PanelPageShell";
import { inventoryApi } from "@/lib/inventory-ui/client";
import { createInventoryConsoleLifecycle, createInventoryTransferConsoleController, type InventoryConsoleSnapshot } from "@/lib/inventory-ui/console-controller";
import { InventoryListState, useInventoryCollection, type InventoryListPhase } from "./InventoryListState";
import { InventoryOperationForm } from "./InventoryOperationForm";
import { useOptionalInventoryWorkspace } from "./InventoryWorkspaceContext";
import type { InventoryConsoleActivity } from "./InventoryOperationForm";
import styles from "./inventory-console.module.css";
import { InventoryLocationConsole } from "./InventoryLocationConsole";

const LABELS: Readonly<Record<InventoryTransferStatus, string>> = Object.freeze({ draft: "İşlem bekliyor", in_transit: "Yolda", received: "Teslim alındı", cancelled: "İptal" });
const date = (value: string) => new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
const number = (id: string) => `TR-${id.slice(0, 8).toUpperCase()}`;
const quantity = (item: InventoryTransfer) => item.lines.reduce((sum, line) => sum + line.quantity, 0);
const tone = (status: InventoryTransferStatus) => status === "received" ? "success" : status === "cancelled" ? "danger" : "neutral";

export function InventoryTransferListPresentation(props: Readonly<{ state: InventoryListPhase; items: readonly InventoryTransfer[]; error: string; canManage?: boolean; onRetry: () => void }>) {
  const workspace = useOptionalInventoryWorkspace();
  const locationName = (id: string) => workspace?.locationName(id) ?? "Depo bilgisi yüklenemedi";
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const query = search.trim().toLocaleLowerCase("tr-TR");
  const visibleItems = props.items.filter((item) => (!status || item.status === status) && (!query || [number(item.id), locationName(item.sourceLocationId), locationName(item.destinationLocationId), item.sourceLocationId, item.destinationLocationId].some((value) => value.toLocaleLowerCase("tr-TR").includes(query))));
  return <InventoryListState state={props.state} count={props.items.length} error={props.error} emptyTitle="Stok transferi yok" emptyDescription="Kalıcı konum transferleri burada görünecek." onRetry={props.onRetry}><div className={styles.listToolbar}>
      <label className={styles.searchField}><span className={styles.srOnly}>Kayıt ara</span><input type="search" value={search} placeholder="Kayıt ara" onChange={(event) => setSearch(event.currentTarget.value)} /></label>
      <label className={styles.statusFilter}><span className={styles.srOnly}>Durum</span><select value={status} onChange={(event) => setStatus(event.currentTarget.value)}><option value="">Tüm durumlar</option>{Object.entries(LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
      <span className={styles.resultCount} role="status">{visibleItems.length} / {props.items.length} kayıt</span>
      {search || status ? <button type="button" onClick={() => { setSearch(""); setStatus(""); }}>Temizle</button> : null}
    </div>
    {!visibleItems.length ? <p className={styles.state}>Eşleşen kayıt yok. Aramanızı veya durum seçiminizi değiştirin.</p> : null}
    <div className={styles.desktopTable} hidden={!visibleItems.length}><table aria-label="Stok transferleri"><thead><tr><th>Numara</th><th>Kaynak</th><th>Hedef</th><th>Durum</th><th>Kalem</th><th>Miktar</th><th>Güncellendi</th></tr></thead><tbody>{visibleItems.map((item) => <tr key={item.id}><td><Link href={`/products/stock?tab=transfers&kind=transfer&id=${item.id}`}>{number(item.id)}</Link></td><td><span>{locationName(item.sourceLocationId)}</span></td><td><span>{locationName(item.destinationLocationId)}</span></td><td><PanelStatusBadge tone={tone(item.status)}>{LABELS[item.status]}</PanelStatusBadge></td><td>{item.lines.length}</td><td>{quantity(item)}</td><td>{date(item.updatedAt)}</td></tr>)}</tbody></table></div><div className={styles.mobileCards} hidden={!visibleItems.length}>{visibleItems.map((item) => <article className={styles.mobileCard} key={item.id}><div className={styles.cardHeading}><Link className={styles.mobileRecordLink} href={`/products/stock?tab=transfers&kind=transfer&id=${item.id}`}>{number(item.id)}</Link><PanelStatusBadge tone={tone(item.status)}>{LABELS[item.status]}</PanelStatusBadge></div><dl><div><dt>Kaynak</dt><dd>{locationName(item.sourceLocationId)}</dd></div><div><dt>Hedef</dt><dd>{locationName(item.destinationLocationId)}</dd></div><div><dt>Kalem</dt><dd>{item.lines.length}</dd></div><div><dt>Miktar</dt><dd>{quantity(item)}</dd></div><div><dt>Güncellendi</dt><dd>{date(item.updatedAt)}</dd></div></dl></article>)}</div></InventoryListState>;
}

export function InventoryTransferPresentation(props: Readonly<{ state: InventoryConsoleSnapshot<InventoryTransfer>; canManage: boolean; hasUnsavedChanges?: boolean; onDispatch: () => void; onReceive: () => void; onCancel: () => void }>) {
  const workspace = useOptionalInventoryWorkspace();
  const locationName = (id: string) => workspace?.locationName(id) ?? "Depo bilgisi yüklenemedi";
  const variantName = (id: string) => workspace?.variantName(id) ?? "Ürün bilgisi yüklenemedi";
  const item = props.state.record;
  if (props.state.phase === "denied") return <div className={styles.denied} role="status">Bu stok transferini görüntüleme yetkiniz yok.</div>;
  if (!item) return <div className={props.state.phase === "error" ? styles.error : styles.state} role={props.state.phase === "error" ? "alert" : "status"}>{props.state.message || "Stok transferi yükleniyor…"}</div>;
  return <><div className={styles.detailSummary}><div><span>Transfer</span><strong>{number(item.id)}</strong></div><div><span>Kaynak</span><strong>{locationName(item.sourceLocationId)}</strong></div><div><span>Hedef</span><strong>{locationName(item.destinationLocationId)}</strong></div><div><span>Durum</span><PanelStatusBadge tone={tone(item.status)}>{LABELS[item.status]}</PanelStatusBadge></div></div>{props.state.message ? <p className={props.state.phase === "conflict" ? styles.conflict : props.state.phase === "error" || props.state.phase === "verification_unavailable" ? styles.errorNotice : styles.notice} role={props.state.phase === "conflict" || props.state.phase === "error" || props.state.phase === "verification_unavailable" ? "alert" : "status"}>{props.state.message}</p> : null}<div className={styles.lineTable} role="region" tabIndex={0} aria-label="İşlem kalemleri"><table aria-label="Transfer kalemleri"><thead><tr><th>Ürün / Varyant</th><th>Miktar</th></tr></thead><tbody>{item.lines.map((line) => <tr key={line.id}><td>{variantName(line.variantId)}</td><td>{line.quantity}</td></tr>)}</tbody></table></div><details className={styles.recordInformation}><summary>İşlem bilgisi</summary><dl><div><dt>Kayıt kimliği</dt><dd><code>{item.id}</code></dd></div><div><dt>Sürüm</dt><dd>{item.version}</dd></div><div><dt>Kaynak depo kimliği</dt><dd><code>{item.sourceLocationId}</code></dd></div><div><dt>Hedef depo kimliği</dt><dd><code>{item.destinationLocationId}</code></dd></div>{item.lines.map((line, index) => <div key={line.id}><dt>{index + 1}. kalem kimliği</dt><dd><code>{line.id}</code> · <code>{line.variantId}</code></dd></div>)}</dl></details>{props.canManage ? <div className={styles.actions}>{item.status === "draft" ? <button className={styles.primary} type="button" disabled={props.state.pending || props.state.locked || props.hasUnsavedChanges} onClick={props.onDispatch}>Sevk et</button> : null}{item.status === "in_transit" ? <button className={styles.primary} type="button" disabled={props.state.pending || props.state.locked} onClick={props.onReceive}>Teslim al</button> : null}{["draft", "in_transit"].includes(item.status) ? <button type="button" disabled={props.state.pending || props.state.locked} onClick={props.onCancel}>İptal et</button> : null}</div> : null}</>;
}

function InventoryTransferDetail(props: Readonly<{ initial?: InventoryTransfer; resourceId?: string; create?: boolean; canRead: boolean; canManage: boolean; initialLocationId?: string; initialVariantId?: string; onStateChange?(state: InventoryConsoleActivity): void }>) {
  const [dirty, setDirty] = useState(false);
  const lifecycle = useRef<ReturnType<typeof createInventoryConsoleLifecycle<ReturnType<typeof createInventoryTransferConsoleController>>> | null>(null);
  const [state, setState] = useState<InventoryConsoleSnapshot<InventoryTransfer>>({ phase: props.canRead ? (props.initial ? "loaded" : "loading") : "denied", ...(props.initial ? { record: props.initial } : {}), pending: false, locked: false, message: "" });
  if (!lifecycle.current) lifecycle.current = createInventoryConsoleLifecycle(() => createInventoryTransferConsoleController({ initial: props.initial, resourceId: props.resourceId, canRead: props.canRead, canManage: props.canManage, directSave: true, api: inventoryApi, onChange: setState }));
  useEffect(() => lifecycle.current!.setup(), []);
  const item = state.record;
  useEffect(() => { if (state.phase === "committed" || state.phase === "replayed") setDirty(false); }, [state.phase, state.record?.id, state.record?.version]);
  useEffect(() => { props.onStateChange?.({ pending: state.pending, locked: state.locked, dirty }); }, [state.pending, state.locked, dirty, props.onStateChange]);
  return <>{!props.create || item ? <InventoryTransferPresentation state={state} canManage={props.canManage} hasUnsavedChanges={dirty} onDispatch={() => { void lifecycle.current?.getCurrent()?.dispatch(); }} onReceive={() => { void lifecycle.current?.getCurrent()?.receive(); }} onCancel={() => { void lifecycle.current?.getCurrent()?.cancel(); }} /> : null}
    {((props.create && !item) || item?.status === "draft") ? <InventoryOperationForm mode="transfer" record={item} initialLocationId={props.initialLocationId} initialVariantId={props.initialVariantId} onDirtyChange={setDirty} canManage={props.canManage} phase={state.phase} pending={state.pending} locked={state.locked} message={state.message} onSave={(value) => { void lifecycle.current?.getCurrent()?.save(value as Parameters<ReturnType<typeof createInventoryTransferConsoleController>["save"]>[0]); }} /> : null}
  </>;
}

export function InventoryTransferConsole(props: Readonly<{ mode?: "list" | "new" | "detail"; initial?: InventoryTransfer; initialItems?: readonly InventoryTransfer[]; resourceId?: string; canRead?: boolean; canManage: boolean; embedded?: boolean; initialLocationId?: string; initialVariantId?: string; onStateChange?(state: InventoryConsoleActivity): void }>) {
  const canRead = props.canRead ?? true, load = useCallback((signal?: AbortSignal) => inventoryApi.listTransfers(signal), []), mode = props.mode ?? (props.initial || props.resourceId ? "detail" : "list"), detail = mode !== "list", list = useInventoryCollection({ enabled: !detail, canRead, initial: props.initialItems, load });
  const title = mode === "new" ? "Yeni stok transferi" : detail ? "Stok transferi ayrıntısı" : "Stok transferleri";
  return <PanelPageShell embedded={props.embedded}><PanelPageHeader embedded={props.embedded} title={title} description="Ürünleri depolar arasında sevk edin ve teslim alın." actions={!props.embedded && mode === "list" && props.canManage ? <span className={styles.pageAction}><PanelActionButton primary href="/products/stock?tab=transfers&kind=transfer&new=1">Yeni stok transferi</PanelActionButton></span> : undefined} />{!props.embedded ? <h1 className={styles.srOnly}>{title}</h1> : null}{detail ? <InventoryTransferDetail initial={props.initial} resourceId={props.resourceId} create={mode === "new"} canRead={canRead} canManage={props.canManage} initialLocationId={props.initialLocationId} initialVariantId={props.initialVariantId} onStateChange={props.onStateChange} /> : <>{!props.embedded ? <details className={styles.locationSection}><summary>Stok konumlarını yönet</summary><InventoryLocationConsole canRead={canRead} canManage={props.canManage} /></details> : null}<InventoryTransferListPresentation state={list.phase} items={list.items} error={list.error} canManage={props.canManage} onRetry={list.retry} /></>}</PanelPageShell>;
}
