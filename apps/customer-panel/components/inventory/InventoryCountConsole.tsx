"use client";

import type { InventoryCount, InventoryCountStatus } from "@celebix/saas-contracts";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { PanelActionButton, PanelPageHeader, PanelPageShell, PanelStatusBadge } from "@/components/panel/PanelPageShell";
import { inventoryApi } from "@/lib/inventory-ui/client";
import { createInventoryConsoleLifecycle, createInventoryCountConsoleController, type InventoryConsoleSnapshot } from "@/lib/inventory-ui/console-controller";
import { InventoryListState, useInventoryCollection, type InventoryListPhase } from "./InventoryListState";
import { InventoryOperationForm } from "./InventoryOperationForm";
import { useOptionalInventoryWorkspace } from "./InventoryWorkspaceContext";
import type { InventoryConsoleActivity } from "./InventoryOperationForm";
import styles from "./inventory-console.module.css";

const LABELS: Readonly<Record<InventoryCountStatus, string>> = Object.freeze({ draft: "İşlem bekliyor", counting: "Sayılıyor", committed: "Tamamlandı", cancelled: "İptal" });
const date = (value: string) => new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
const name = (id: string) => `Sayım ${id.slice(0, 8).toUpperCase()}`;
const tone = (status: InventoryCountStatus) => status === "committed" ? "success" : status === "cancelled" ? "danger" : "neutral";
const variance = (item: InventoryCount) => item.lines.some((line) => line.countedQuantity === undefined) ? null : item.lines.reduce((sum, line) => sum + line.countedQuantity! - line.expectedQuantity, 0);

export function InventoryCountListPresentation(props: Readonly<{ state: InventoryListPhase; items: readonly InventoryCount[]; error: string; canManage?: boolean; onRetry: () => void }>) {
  const workspace = useOptionalInventoryWorkspace();
  const locationName = (id: string) => workspace?.locationName(id) ?? "Depo bilgisi yüklenemedi";
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const query = search.trim().toLocaleLowerCase("tr-TR");
  const visibleItems = props.items.filter((item) => (!status || item.status === status) && (!query || [name(item.id), locationName(item.locationId), item.locationId].some((value) => value.toLocaleLowerCase("tr-TR").includes(query))));
  return <InventoryListState state={props.state} count={props.items.length} error={props.error} emptyTitle="Stok sayımı yok" emptyDescription="Kalıcı stok sayımları burada görünecek." onRetry={props.onRetry}><div className={styles.listToolbar}>
      <label className={styles.searchField}><span className={styles.srOnly}>Kayıt ara</span><input type="search" value={search} placeholder="Kayıt ara" onChange={(event) => setSearch(event.currentTarget.value)} /></label>
      <label className={styles.statusFilter}><span className={styles.srOnly}>Durum</span><select value={status} onChange={(event) => setStatus(event.currentTarget.value)}><option value="">Tüm durumlar</option>{Object.entries(LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
      <span className={styles.resultCount} role="status">{visibleItems.length} / {props.items.length} kayıt</span>
      {search || status ? <button type="button" onClick={() => { setSearch(""); setStatus(""); }}>Temizle</button> : null}
    </div>
    {!visibleItems.length ? <p className={styles.state}>Eşleşen kayıt yok. Aramanızı veya durum seçiminizi değiştirin.</p> : null}
    <div className={styles.desktopTable} hidden={!visibleItems.length}><table aria-label="Stok sayımları"><thead><tr><th>Ad</th><th>Konum</th><th>Durum</th><th>Kalem</th><th>Fark</th><th>Güncellendi</th></tr></thead><tbody>{visibleItems.map((item) => <tr key={item.id}><td><Link href={`/products/stock?tab=counts&kind=count&id=${item.id}`}>{name(item.id)}</Link></td><td><span>{locationName(item.locationId)}</span></td><td><PanelStatusBadge tone={tone(item.status)}>{LABELS[item.status]}</PanelStatusBadge></td><td>{item.lines.length}</td><td>{variance(item) ?? "Bekliyor"}</td><td>{date(item.updatedAt)}</td></tr>)}</tbody></table></div><div className={styles.mobileCards} hidden={!visibleItems.length}>{visibleItems.map((item) => <article className={styles.mobileCard} key={item.id}><div className={styles.cardHeading}><Link className={styles.mobileRecordLink} href={`/products/stock?tab=counts&kind=count&id=${item.id}`}>{name(item.id)}</Link><PanelStatusBadge tone={tone(item.status)}>{LABELS[item.status]}</PanelStatusBadge></div><dl><div><dt>Konum</dt><dd>{locationName(item.locationId)}</dd></div><div><dt>Kalem</dt><dd>{item.lines.length}</dd></div><div><dt>Fark</dt><dd>{variance(item) ?? "Bekliyor"}</dd></div><div><dt>Güncellendi</dt><dd>{date(item.updatedAt)}</dd></div></dl></article>)}</div></InventoryListState>;
}

export function InventoryCountPresentation(props: Readonly<{ state: InventoryConsoleSnapshot<InventoryCount>; canManage: boolean; hasUnsavedChanges?: boolean; onStart: () => void; onCommit: () => void; onCancel: () => void }>) {
  const workspace = useOptionalInventoryWorkspace();
  const locationName = (id: string) => workspace?.locationName(id) ?? "Depo bilgisi yüklenemedi";
  const variantName = (id: string) => workspace?.variantName(id) ?? "Ürün bilgisi yüklenemedi";
  const [reviewVersion, setReviewVersion] = useState<number | null>(null);
  const reviewRef = useRef<HTMLElement | null>(null);
  const completeButton = useRef<HTMLButtonElement | null>(null);
  const reviewFocused = useRef(false);
  const item = props.state.record;
  useEffect(() => {
    const active = item?.status === "counting" && reviewVersion === item.version && !props.hasUnsavedChanges;
    if (active && !reviewFocused.current) reviewRef.current?.focus();
    else if (!active && reviewFocused.current) completeButton.current?.focus();
    reviewFocused.current = active;
  }, [reviewVersion, item?.version, item?.status, props.hasUnsavedChanges]);
  if (props.state.phase === "denied") return <div className={styles.denied} role="status">Bu stok sayımını görüntüleme yetkiniz yok.</div>;
  if (!item) return <div className={props.state.phase === "error" ? styles.error : styles.state} role={props.state.phase === "error" ? "alert" : "status"}>{props.state.message || "Stok sayımı yükleniyor…"}</div>;
  const counted = item.lines.every((line) => line.countedQuantity !== undefined);
  const reviewing = reviewVersion === item.version && item.status === "counting" && counted && !props.hasUnsavedChanges;
  const step = item.status === "draft" ? 1 : item.status === "counting" && !counted ? 2 : 3;
  return <><ol className={styles.countSteps} aria-label="Sayım adımları">{["Ürünleri seç", "Say ve kaydet", "Farkları uygula"].map((label, index) => <li key={label} aria-current={step === index + 1 ? "step" : undefined}><span>{index + 1}</span>{label}</li>)}</ol><div className={styles.detailSummary}><div><span>Sayım</span><strong>{name(item.id)}</strong></div><div><span>Depo</span><strong>{locationName(item.locationId)}</strong></div><div><span>Durum</span><PanelStatusBadge tone={tone(item.status)}>{LABELS[item.status]}</PanelStatusBadge></div></div>{props.state.message ? <p className={props.state.phase === "conflict" ? styles.conflict : props.state.phase === "error" || props.state.phase === "verification_unavailable" ? styles.errorNotice : styles.notice} role={props.state.phase === "conflict" || props.state.phase === "error" || props.state.phase === "verification_unavailable" ? "alert" : "status"}>{props.state.message}</p> : null}<div className={styles.lineTable} role="region" tabIndex={0} aria-label="İşlem kalemleri"><table aria-label="Sayım kalemleri"><thead><tr><th>Ürün / Varyant</th><th>Beklenen</th><th>Sayılan</th><th>Fark</th></tr></thead><tbody>{item.lines.map((line) => <tr key={line.id}><td>{variantName(line.variantId)}</td><td>{item.status === "draft" ? "Sayım başlayınca" : line.expectedQuantity}</td><td>{item.status === "draft" ? "Bekliyor" : line.countedQuantity ?? "Bekliyor"}</td><td>{item.status === "draft" || line.countedQuantity === undefined ? "Bekliyor" : line.countedQuantity - line.expectedQuantity}</td></tr>)}</tbody></table></div><details className={styles.recordInformation}><summary>İşlem bilgisi</summary><dl><div><dt>Kayıt kimliği</dt><dd><code>{item.id}</code></dd></div><div><dt>Sürüm</dt><dd>{item.version}</dd></div><div><dt>Depo kimliği</dt><dd><code>{item.locationId}</code></dd></div>{item.lines.map((line, index) => <div key={line.id}><dt>{index + 1}. kalem kimliği</dt><dd><code>{line.id}</code> · <code>{line.variantId}</code></dd></div>)}</dl></details>{props.canManage ? <div className={styles.actions}>{item.status === "draft" ? <button className={styles.primary} type="button" disabled={props.state.pending || props.state.locked || props.hasUnsavedChanges} onClick={props.onStart}>Sayımı başlat</button> : null}{item.status === "counting" && !reviewing ? <button ref={completeButton} className={styles.primary} type="button" disabled={props.state.pending || props.state.locked || !counted || props.hasUnsavedChanges} onClick={() => setReviewVersion(item.version)}>Sayımı tamamla</button> : null}{["draft", "counting"].includes(item.status) ? <button type="button" disabled={props.state.pending || props.state.locked} onClick={props.onCancel}>İptal et</button> : null}</div> : null}{props.hasUnsavedChanges && item.status === "counting" ? <p className={styles.formHelp}>Önce sayılan miktarları kaydedin.</p> : null}{reviewing ? <section ref={reviewRef} tabIndex={-1} className={styles.countReview} aria-labelledby="inventory-count-review-title"><h2 id="inventory-count-review-title">Sayım farklarını kontrol edin</h2><p>Her ürün için Sayılan − Beklenen farkı depo stoklarına uygulanır.</p><dl>{item.lines.map(line => <div key={line.id}><dt>{variantName(line.variantId)}</dt><dd>{line.countedQuantity} − {line.expectedQuantity} = <strong>{line.countedQuantity! - line.expectedQuantity > 0 ? "+" : ""}{line.countedQuantity! - line.expectedQuantity}</strong></dd></div>)}</dl><div className={styles.actions}><button type="button" disabled={props.state.pending || props.state.locked} onClick={() => setReviewVersion(null)}>Geri dön</button><button className={styles.primary} type="button" disabled={props.state.pending || props.state.locked || props.hasUnsavedChanges} onClick={props.onCommit}>Farkları uygula</button></div></section> : null}</>;
}

function InventoryCountDetail(props: Readonly<{ initial?: InventoryCount; resourceId?: string; create?: boolean; canRead: boolean; canManage: boolean; initialLocationId?: string; initialVariantId?: string; onStateChange?(state: InventoryConsoleActivity): void }>) {
  const [dirty, setDirty] = useState(false);
  const lifecycle = useRef<ReturnType<typeof createInventoryConsoleLifecycle<ReturnType<typeof createInventoryCountConsoleController>>> | null>(null);
  const [state, setState] = useState<InventoryConsoleSnapshot<InventoryCount>>({ phase: props.canRead ? (props.initial ? "loaded" : "loading") : "denied", ...(props.initial ? { record: props.initial } : {}), pending: false, locked: false, message: "" });
  if (!lifecycle.current) lifecycle.current = createInventoryConsoleLifecycle(() => createInventoryCountConsoleController({ initial: props.initial, resourceId: props.resourceId, canRead: props.canRead, canManage: props.canManage, directSave: true, api: inventoryApi, onChange: setState }));
  useEffect(() => lifecycle.current!.setup(), []);
  const item = state.record;
  useEffect(() => { if (state.phase === "committed" || state.phase === "replayed") setDirty(false); }, [state.phase, state.record?.id, state.record?.version]);
  useEffect(() => { props.onStateChange?.({ pending: state.pending, locked: state.locked, dirty }); }, [state.pending, state.locked, dirty, props.onStateChange]);
  return <>{!props.create || item ? <InventoryCountPresentation state={state} canManage={props.canManage} hasUnsavedChanges={dirty} onStart={() => { void lifecycle.current?.getCurrent()?.start(); }} onCommit={() => { void lifecycle.current?.getCurrent()?.commit(); }} onCancel={() => { void lifecycle.current?.getCurrent()?.cancel(); }} /> : null}
    {((props.create && !item) || item?.status === "draft" || item?.status === "counting") ? <InventoryOperationForm mode="count" record={item} initialLocationId={props.initialLocationId} initialVariantId={props.initialVariantId} onDirtyChange={setDirty} canManage={props.canManage} phase={state.phase} pending={state.pending} locked={state.locked} message={state.message} onSave={(value) => { void lifecycle.current?.getCurrent()?.save(value as Parameters<ReturnType<typeof createInventoryCountConsoleController>["save"]>[0]); }} /> : null}
  </>;
}

export function InventoryCountConsole(props: Readonly<{ mode?: "list" | "new" | "detail"; initial?: InventoryCount; initialItems?: readonly InventoryCount[]; resourceId?: string; canRead?: boolean; canManage: boolean; embedded?: boolean; initialLocationId?: string; initialVariantId?: string; onStateChange?(state: InventoryConsoleActivity): void }>) {
  const canRead = props.canRead ?? true, load = useCallback((signal?: AbortSignal) => inventoryApi.listCounts(signal), []), mode = props.mode ?? (props.initial || props.resourceId ? "detail" : "list"), detail = mode !== "list", list = useInventoryCollection({ enabled: !detail, canRead, initial: props.initialItems, load });
  const title = mode === "new" ? "Yeni stok sayımı" : detail ? "Stok sayımı ayrıntısı" : "Stok sayımları";
  return <PanelPageShell embedded={props.embedded}><PanelPageHeader embedded={props.embedded} title={title} description="Depo stoklarını sayın ve farkları uygulayın." actions={!props.embedded && mode === "list" && props.canManage ? <span className={styles.pageAction}><PanelActionButton primary href="/products/stock?tab=counts&kind=count&new=1">Yeni stok sayımı</PanelActionButton></span> : undefined} />{!props.embedded ? <h1 className={styles.srOnly}>{title}</h1> : null}{detail ? <InventoryCountDetail initial={props.initial} resourceId={props.resourceId} create={mode === "new"} canRead={canRead} canManage={props.canManage} initialLocationId={props.initialLocationId} initialVariantId={props.initialVariantId} onStateChange={props.onStateChange} /> : <InventoryCountListPresentation state={list.phase} items={list.items} error={list.error} canManage={props.canManage} onRetry={list.retry} />}</PanelPageShell>;
}
