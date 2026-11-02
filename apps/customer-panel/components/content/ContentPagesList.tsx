"use client";

import type { MerchantAdminRecord } from "@celebix/saas-contracts";
import { Archive, Eye, Pencil, Plus, RefreshCcw, Search, X } from "lucide-react";
import Link from "next/link";

import { PanelStatusBadge } from "@/components/panel/PanelPageShell";
import { editRouteFor } from "@/lib/merchant-admin-ui/record-route";
import { merchantRecordPresentationStatus, type MerchantModuleStatusFilter } from "@/lib/merchant-admin-ui/presentation";
import type { AssociatedPolicyPage } from "@/lib/content-pages-ui/policy-associations";
import styles from "./content-pages.module.css";

export function PageArtwork({ page }: { page?: MerchantAdminRecord["requiredPageKey"] }) {
  return <svg className={styles.artwork} viewBox="0 0 144 104" aria-hidden="true" focusable="false">
    <ellipse cx="72" cy="88" rx="58" ry="10" className={styles.artSoft} />
    {page === "about" ? <>
      <path d="M35 38h74v44H35zM29 38h86l-9-21H38z" className={styles.artOutline} />
      <path d="m42 18-4 20m22-20-1 20m20-20 1 20m19-20 5 20" className={styles.artLine} />
      <path d="M46 49h23v20H46zM85 49h14v33H85z" className={styles.artMuted} />
      <path d="M47 58h21m13 9h5" className={styles.artLine} />
      <path d="m119 25 5-7m-3 20h8" className={styles.artAccent} />
    </> : page === "contact" ? <>
      <path d="M29 23h76a10 10 0 0 1 10 10v39a10 10 0 0 1-10 10H65L45 94V82H29a10 10 0 0 1-10-10V33a10 10 0 0 1 10-10z" className={styles.artOutline} />
      <path d="M39 44h54M39 59h35" className={styles.artLine} />
      <circle cx="112" cy="73" r="19" className={styles.artOutline} />
      <path d="m103 73 6 6 12-13m1-49 3-7m4 18 8-3" className={styles.artAccent} />
    </> : page === "blog" ? <>
      <path d="M21 24q25-8 51 3 26-11 51-3v59q-25-8-51 3-26-11-51-3z" className={styles.artOutline} />
      <path d="M72 27v59M34 58h24M34 68h21M86 40h24M86 51h24M86 62h21" className={styles.artLine} />
      <path d="M34 35h24v12H34z" className={styles.artMuted} />
      <path d="m101 18 4-8m9 12 7-5M80 77h17" className={styles.artAccent} />
    </> : <>
      <path d="M43 14h42l22 22v51H43z" className={styles.artOutline} />
      <path d="M85 14v22h22M56 50h35M56 62h35M56 74h22" className={styles.artLine} />
      <path d="m116 44 8-3m-8-9 4-7" className={styles.artAccent} />
    </>}
  </svg>;
}

type ToolbarProps = Readonly<{
  kind?: "page" | "blog_post";
  query: string; onQuery: (query: string) => void;
  filter: MerchantModuleStatusFilter; onFilter: (filter: MerchantModuleStatusFilter) => void;
  counts: Readonly<{ total: number; active: number; draft: number; archived: number }>;
  loaded: boolean; loading: boolean; busy: boolean; canManage: boolean;
  onRefresh: () => void; onClear: () => void;
}>;

export function ContentPagesToolbar(props: ToolbarProps) {
  const blog = props.kind === "blog_post";
  const searchLabel = blog ? "Yazı ara" : "Sayfa ara";
  return <div className={styles.toolbar}>
    <div className={styles.controls}>
      <label className={styles.search}><Search aria-hidden="true" /><span className="sr-only">{searchLabel}</span><input type="search" aria-label={searchLabel} placeholder={searchLabel} maxLength={160} value={props.query} onChange={event => props.onQuery(event.currentTarget.value)} /></label>
      <button type="button" className="button button-text icon-only-button" aria-label={blog ? "Yazıları yenile" : "Sayfaları yenile"} title="Yenile" disabled={props.loading || props.busy} onClick={props.onRefresh}><RefreshCcw aria-hidden="true" /></button>
      {props.canManage ? <Link href={blog ? "/content/blog/new" : "/content/pages/new"} className="button button-primary"><Plus aria-hidden="true" />{blog ? "Yazı ekle" : "Sayfa ekle"}</Link> : null}
    </div>
    <div className={styles.filterBar}>
      <div className={styles.filters} role="group" aria-label="Durum filtresi">
        {([ ["all", "Tümü", props.counts.total], ["active", "Yayında", props.counts.active], ["draft", "Taslak", props.counts.draft], ["archived", "Arşiv", props.counts.archived] ] as const).map(([value, label, count]) => <button type="button" key={value} aria-pressed={props.filter === value} onClick={() => props.onFilter(value)}>{label}<span>{props.loaded ? count.toLocaleString("tr-TR") : "—"}</span></button>)}
      </div>
      {props.query.trim() || props.filter !== "all" ? <button type="button" className="button button-text" onClick={props.onClear}><X aria-hidden="true" /><span className={styles.clearLabel}>Temizle</span></button> : null}
    </div>
  </div>;
}

export function ContentPagesList({ kind = "page", records, policyRecords = [], canManage, busy, onArchive }: Readonly<{ kind?: "page" | "blog_post"; records: readonly MerchantAdminRecord[]; policyRecords?: readonly AssociatedPolicyPage[]; canManage: boolean; busy: boolean; onArchive: (record: MerchantAdminRecord) => void }>) {
  const blog = kind === "blog_post";
  const row = (record: MerchantAdminRecord, policyKey?: AssociatedPolicyPage["policyKey"]) => {
      const status = merchantRecordPresentationStatus(record);
      const label = status === "active" ? "Yayında" : status === "draft" ? "Taslak" : "Arşivlendi";
      const href = editRouteFor(kind, record.id)!;
      const policyHref = policyKey ? `/content/policies/${policyKey}/edit` : null;
      return <li className={styles.row} key={record.id}>
        <div className={styles.identity}><PageArtwork page={blog ? "blog" : record.requiredPageKey} /><Link href={policyHref ?? href} className={styles.name}>{record.name}</Link></div>
        <div className={styles.status}><PanelStatusBadge tone={status === "active" ? "success" : "neutral"}>{label}</PanelStatusBadge></div>
        <time className={styles.updated} dateTime={record.updatedAt} title={new Date(record.updatedAt).toLocaleString("tr-TR")}>{new Date(record.updatedAt).toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric" })}<small>{new Date(record.updatedAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}</small></time>
        {policyHref ? <div className={styles.policyLinks}>
          <Link href={policyHref} className="button button-secondary" aria-label={`${record.name} politikasını aç`}>Politikayı aç</Link>
          <Link href={href} className="button button-text" aria-label={`${record.name} sayfa kaydını ${canManage ? "düzenle" : "görüntüle"}`}>Sayfa kaydı</Link>
        </div> : <div className={styles.actions}><Link href={href} className="button button-secondary" aria-label={`${record.name} kaydını ${canManage ? "düzenle" : "görüntüle"}`}>{canManage ? <Pencil aria-hidden="true" /> : <Eye aria-hidden="true" />}{canManage ? "Düzenle" : "Görüntüle"}</Link>{canManage && !record.requiredPageKey ? <button type="button" className="button button-text icon-only-button" aria-label={`${record.name} kaydını arşivle`} title="Arşivle" disabled={busy || record.status === "archived"} onClick={() => onArchive(record)}><Archive aria-hidden="true" /></button> : null}</div>}
      </li>;
  };
  return <>
    {records.length ? <div className={styles.list}>
      <div className={styles.columns} aria-hidden="true"><span>{blog ? "Yazı" : "Sayfa"}</span><span>Durum</span><span>Son düzenleme</span><span /></div>
      <ul aria-label={blog ? "Blog yazıları" : "Sayfalar"}>{records.map(record => row(record))}</ul>
    </div> : null}
    {policyRecords.length ? <div className={`${styles.editorHistory} ${styles.list}`}>
      <details aria-label="Politika metinleri">
        <summary>Politika metinleri ({policyRecords.length})</summary>
        <p>Bu sayfaların aynı metni Politikalar bölümünde de bulunuyor.</p>
        <ul aria-label="Politika sayfa kayıtları">{policyRecords.map(({ record, policyKey }) => row(record, policyKey))}</ul>
      </details>
    </div> : null}
  </>;
}

export function ContentPagesLoading({ kind = "page" }: { kind?: "page" | "blog_post" }) {
  const label = kind === "blog_post" ? "Yazılar yükleniyor" : "Sayfalar yükleniyor";
  return <div className={styles.loading} role="status" aria-label={label}><span className="sr-only">{label}…</span>{[0, 1, 2].map(row => <div key={row} aria-hidden="true"><span /><span /><span /></div>)}</div>;
}
