"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { InventoryBalance } from "@celebix/saas-contracts";

import { inventoryApi } from "@/lib/inventory-ui/client";
import { buildStockRows, filterStockRows, stockRowsCsv, type StockFilter, type StockRow } from "@/lib/inventory-ui/workspace-data";
import { useInventoryWorkspace } from "./InventoryWorkspaceContext";
import styles from "./stock-overview.module.css";

export type StockCorrectionSelection = Readonly<{ locationId: string; variantId: string }>;
type BalanceState = Readonly<{
  phase: "loading" | "loaded" | "error";
  locationId: string;
  revision: number;
  items: readonly InventoryBalance[];
}>;

export function StockOverview(props: Readonly<{
  canManage: boolean;
  canPurchase?: boolean;
  onCorrect(selection: StockCorrectionSelection): void;
  onPurchase(selection?: StockCorrectionSelection | Readonly<{ locationId: string }>): void;
}>) {
  const workspace = useInventoryWorkspace();
  const [selectedLocation, setSelectedLocation] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<StockFilter>("all");
  const [threshold, setThreshold] = useState("5");
  const [attempt, setAttempt] = useState(0);
  const [balanceState, setBalanceState] = useState<BalanceState>({ phase: "loading", locationId: "", revision: 0, items: [] });
  const activeLocations = workspace.locations.filter(({ status }) => status === "active");
  const location = activeLocations.find(({ id }) => id === selectedLocation)
    ?? activeLocations.find(({ isDefault }) => isDefault) ?? activeLocations[0];
  const locationId = location?.id ?? "";
  const validThreshold = /^(?:[1-9]\d*)$/.test(threshold) && Number.isSafeInteger(Number(threshold)) && Number(threshold) <= 2_147_483_647;

  useEffect(() => {
    if (workspace.phase !== "loaded" || !workspace.inventoryCanRead || !locationId) return;
    const request = new AbortController();
    const revision = workspace.revision;
    setBalanceState({ phase: "loading", locationId, revision, items: [] });
    void inventoryApi.listBalances(locationId, request.signal).then((items) => {
      if (request.signal.aborted) return;
      if (items.some((item) => item.locationId !== locationId) || new Set(items.map(({ variantId }) => variantId)).size !== items.length) {
        throw new Error("inventory_balance_location_mismatch");
      }
      setBalanceState({ phase: "loaded", locationId, revision, items });
    }).catch(() => {
      if (!request.signal.aborted) setBalanceState({ phase: "error", locationId, revision, items: [] });
    });
    return () => request.abort();
  }, [workspace.phase, workspace.inventoryCanRead, workspace.revision, locationId, attempt]);

  const currentBalances = workspace.phase === "loaded" && balanceState.locationId === locationId && balanceState.revision === workspace.revision;
  const phase = currentBalances ? balanceState.phase : "loading";
  const rows = useMemo(() => phase === "loaded" ? buildStockRows(workspace.variants, balanceState.items) : [], [phase, workspace.variants, balanceState.items]);
  const visibleRows = useMemo(() => filter === "low" && !validThreshold ? [] : filterStockRows(rows, { search, status: filter, lowThreshold: Number(threshold) }), [rows, search, filter, threshold, validThreshold]);

  function exportCsv() {
    if (phase !== "loaded" || !location || !visibleRows.length) return;
    const url = URL.createObjectURL(new Blob(["\uFEFF", stockRowsCsv(visibleRows, location.name)], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "celebix-depo-stoku.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }
  function correct(row: StockRow) {
    if (props.canManage && row.canCorrect && phase === "loaded" && locationId) props.onCorrect({ locationId, variantId: row.variantId });
  }
  function purchase(row?: StockRow) {
    if (!props.canPurchase || phase !== "loaded" || !locationId || (row && row.quantity !== undefined)) return;
    props.onPurchase(row ? { locationId, variantId: row.variantId } : { locationId });
  }
  function rowActions(row: StockRow) {
    return <div className={styles.rowActions}>
      {props.canManage ? <button type="button" aria-label={`${row.productTitle} · ${row.variantTitle} stokunu düzelt`} disabled={!row.canCorrect} onClick={() => correct(row)}>Stok düzelt</button> : null}
      {row.quantity === undefined && props.canPurchase ? <button type="button" onClick={() => purchase(row)}>Stok ekle</button> : null}
    </div>;
  }
  function rowTitle(row: StockRow) {
    return <div className={styles.identity}>
      {row.productId ? <Link href={`/products/${row.productId}`}>{row.productTitle}</Link> : <strong>{row.productTitle}</strong>}
      {row.variantTitle ? <span>{row.variantTitle}</span> : null}
      {row.sku ? <small>{row.sku}</small> : null}
    </div>;
  }

  if (!workspace.inventoryCanRead) return <p className={styles.state} role="status">Depo stoklarını görüntüleme yetkiniz yok.</p>;
  if (workspace.phase === "error") return <div className={styles.state} role="alert"><p>Ürün ve depo bilgileri yüklenemedi.</p><button type="button" onClick={workspace.reload}>Tekrar dene</button></div>;
  if (workspace.phase === "loading") return <div className={styles.loading} role="status"><p>Ürün ve depo bilgileri yükleniyor…</p><div className={styles.skeleton} aria-hidden="true" /></div>;
  if (!location) return <div className={styles.state} role="status"><p>Etkin depo bulunamadı. Depolar bölümünden bir depo ekleyin.</p></div>;

  return <section className={styles.overview} aria-label="Depo stokları">
    <div className={styles.toolbar}>
      <label className={styles.depot}><span>Depo</span><select aria-label="Depo" value={locationId} onChange={(event) => setSelectedLocation(event.currentTarget.value)}>{activeLocations.map((item) => <option value={item.id} key={item.id}>{item.name}{item.isDefault ? " · Varsayılan" : ""}</option>)}</select></label>
      <label className={styles.search}><span className={styles.srOnly}>Stokta ürün ara</span><input aria-label="Stokta ürün ara" type="search" placeholder="Ürün, varyant veya SKU ara" value={search} onChange={(event) => setSearch(event.currentTarget.value)} /></label>
      <label className={styles.filter}><span className={styles.srOnly}>Stok durumu</span><select aria-label="Stok durumu" value={filter} onChange={(event) => setFilter(event.currentTarget.value as StockFilter)}><option value="all">Tümü</option><option value="zero">Stok yok</option><option value="low">Azalan</option></select></label>
      {filter === "low" ? <label className={styles.threshold}><span>Eşik</span><input aria-label="Azalan stok eşiği" type="number" inputMode="numeric" min="1" max="2147483647" value={threshold} aria-invalid={!validThreshold} onChange={(event) => setThreshold(event.currentTarget.value)} /></label> : null}
      <button className={styles.export} type="button" disabled={phase !== "loaded" || !visibleRows.length} onClick={exportCsv}>CSV indir</button>
    </div>
    {filter === "low" && !validThreshold ? <p className={styles.notice} role="alert">Eşik için 1 veya daha büyük bir tam sayı girin.</p> : null}
    {phase === "loading" ? <div className={styles.loading} role="status"><p>Depo stoku yükleniyor…</p><div className={styles.skeleton} aria-hidden="true" /></div> : phase === "error" ? <div className={styles.state} role="alert"><p>Depo stoku yüklenemedi.</p><button type="button" onClick={() => setAttempt((value) => value + 1)}>Tekrar dene</button></div> : <>
      <div className={styles.listContext} role="status"><span>{visibleRows.length} / {rows.length} varyant</span>{filter === "low" && validThreshold ? <span>{threshold} ve altındaki stoklar</span> : null}{search || filter !== "all" ? <button type="button" onClick={() => { setSearch(""); setFilter("all"); }}>Filtreleri temizle</button> : null}</div>
      {visibleRows.length ? <>
        <div className={styles.table} role="region" aria-label="Depo stok listesi" tabIndex={0}><table aria-label="Depo stokları"><thead><tr><th>Ürün</th><th>Depo stoku</th>{props.canManage || props.canPurchase ? <th><span className={styles.srOnly}>İşlemler</span></th> : null}</tr></thead><tbody>{visibleRows.map((row) => <tr key={row.variantId}><td>{rowTitle(row)}</td><td className={styles.quantity}>{row.quantity === undefined ? <span className={styles.missing}>Kayıt yok</span> : <strong data-stock-quantity={row.quantity}>{row.quantity}</strong>}</td>{props.canManage || props.canPurchase ? <td>{rowActions(row)}</td> : null}</tr>)}</tbody></table></div>
        <div className={styles.mobileList}>{visibleRows.map((row) => <article className={styles.mobileRow} key={row.variantId}><div className={styles.mobileMain}>{rowTitle(row)}<div className={styles.mobileQuantity}><span>Depo stoku</span>{row.quantity === undefined ? <strong className={styles.missing}>Kayıt yok</strong> : <strong>{row.quantity}</strong>}</div></div>{rowActions(row)}</article>)}</div>
        {visibleRows.some((row) => row.quantity === undefined) ? <p className={styles.help}>Kayıt yok: bu depoda henüz stok bakiyesi oluşmamış.</p> : null}
      </> : <div className={styles.state} role="status"><p>{rows.length ? "Bu filtrelere uyan varyant yok." : "Bu depoda gösterilecek ürün veya stok kaydı yok."}</p>{!rows.length && props.canPurchase ? <button type="button" onClick={() => purchase()}>Satın alma oluştur</button> : null}</div>}
    </>}
  </section>;
}
