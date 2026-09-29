"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  CustomerListItem,
  CustomerStatus,
  CustomerSummary,
} from "@celebix/saas-contracts";
import {
  Archive,
  ArrowRight,
  Download,
  MailCheck,
  RefreshCcw,
  Search,
  SlidersHorizontal,
  UserPlus,
  UsersRound,
  WalletCards,
} from "lucide-react";
import {
  PanelPageHeader,
  PanelPageShell,
  PanelStatusBadge,
} from "@/components/panel/PanelPageShell";
import { CustomerApiError, customerApi } from "@/lib/customer-ui/client";
import styles from "./customer-console.module.css";
function money(c: number, cur: string) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: cur,
  }).format(c / 100);
}
function date(v: string) {
  return new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium" }).format(
    new Date(v),
  );
}
function message(e: unknown) {
  return e instanceof CustomerApiError ? e.message : "Müşteriler yüklenemedi.";
}
export function CustomerListConsole({ canManage, embedded = false }: { canManage: boolean; embedded?: boolean }) {
  const [state, setState] = useState<"loading" | "loaded" | "error">("loading"),
    [items, setItems] = useState<readonly CustomerListItem[]>([]),
    [summary, setSummary] = useState<CustomerSummary | null>(null),
    [searchInput, setSearchInput] = useState(""),
    [search, setSearch] = useState(""),
    [status, setStatus] = useState<CustomerStatus | "all">("all"),
    [cursor, setCursor] = useState<string>(),
    [error, setError] = useState(""),
    [exporting, setExporting] = useState(false),
    [loadingMore, setLoadingMore] = useState(false),
    [appendError, setAppendError] = useState("");
  const queryGeneration = useRef(0);
  const appendInFlight = useRef<number | null>(null);
  const load = useCallback(
    async (append = false) => {
      let generation: number;
      if (append) {
        generation = queryGeneration.current;
        if (appendInFlight.current === generation || !cursor) return;
        appendInFlight.current = generation;
        setLoadingMore(true);
        setAppendError("");
      } else {
        generation = queryGeneration.current + 1;
        queryGeneration.current = generation;
        appendInFlight.current = null;
        setLoadingMore(false);
        setState("loading");
        setError("");
        setAppendError("");
      }
      try {
        const [s, l] = await Promise.all([
          customerApi.summary(),
          customerApi.list({
            pageSize: 25,
            ...(append && cursor ? { cursor } : {}),
            ...(status === "all" ? {} : { status }),
            ...(search ? { search } : {}),
          }),
        ]);
        if (queryGeneration.current !== generation) return;
        setSummary(s);
        setItems((old) =>
          append ? Object.freeze([...old, ...l.items]) : l.items,
        );
        setCursor(l.nextCursor);
        if (!append) setState("loaded");
      } catch (e) {
        if (queryGeneration.current !== generation) return;
        if (append) setAppendError(message(e));
        else {
          setError(message(e));
          setState("error");
        }
      } finally {
        if (
          append &&
          queryGeneration.current === generation &&
          appendInFlight.current === generation
        ) {
          appendInFlight.current = null;
          setLoadingMore(false);
        }
      }
    },
    [cursor, search, status],
  );
  useEffect(() => {
    void load(false);
  }, [search, status]);
  async function exportCsv() {
    if (exporting) return;
    setExporting(true);
    setError("");
    try {
      const x = await customerApi.export(),
        head = "Ad,Soyad,E-posta,Telefon,Durum,Sipariş,Toplam\n",
        rows = x.items
          .map((c) =>
            [
              c.firstName,
              c.lastName,
              c.email ?? "",
              c.phone ?? "",
              c.status,
              String(c.orderCount),
              String(c.totalSpentCents),
            ]
              .map((v) => `"${v.replaceAll('"', '""')}"`)
              .join(","),
          )
          .join("\n"),
        blob = new Blob([head + rows], { type: "text/csv;charset=utf-8" }),
        url = URL.createObjectURL(blob),
        a = document.createElement("a");
      a.href = url;
      a.download = `musteriler-${x.exportedAt.slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(message(e));
    } finally {
      setExporting(false);
    }
  }
  function clearFilters() {
    setSearchInput("");
    setSearch("");
    setStatus("all");
  }
  const activeFilters = Number(Boolean(search)) + Number(status !== "all");
  return (
    <PanelPageShell embedded={embedded}>
      {!embedded ? <h1 className="sr-only">Müşteriler</h1> : null}
      <PanelPageHeader
        title="Müşteriler"
        description="Müşteri kayıtlarını, izinleri, etiketleri ve segmentleri tek yerden yönetin."
        embedded={embedded}
        actions={!embedded && canManage ? (
          <Link className={styles.customerPrimaryAction} href="/customers/new">
            <UserPlus aria-hidden="true" />Yeni Müşteri
          </Link>
        ) : undefined}
      />
      {summary ? (
        <section className={styles.customerMetrics} aria-label="Müşteri özeti">
          <article className={styles.customerMetric}>
            <div className={styles.customerMetricLabel}><UsersRound aria-hidden="true" /><span>Aktif müşteri</span></div>
            <strong>{summary.active.toLocaleString("tr-TR")}</strong>
            <small>Güncel müşteri kaydı</small>
          </article>
          <article className={styles.customerMetric}>
            <div className={styles.customerMetricLabel}><Archive aria-hidden="true" /><span>Arşiv</span></div>
            <strong>{summary.archived.toLocaleString("tr-TR")}</strong>
            <small>Arşivlenmiş kayıt</small>
          </article>
          <article className={styles.customerMetric}>
            <div className={styles.customerMetricLabel}><MailCheck aria-hidden="true" /><span>E-posta izinli</span></div>
            <strong>{summary.consentedEmail.toLocaleString("tr-TR")}</strong>
            <small>Pazarlama izni olan</small>
          </article>
          <article className={`${styles.customerMetric} ${styles.customerMetricValue}`}>
            <div className={styles.customerMetricLabel}><WalletCards aria-hidden="true" /><span>Toplam harcama</span></div>
            <strong>{money(summary.totalSpentCents, summary.currency)}</strong>
            <small>Tüm müşteri harcaması</small>
          </article>
        </section>
      ) : null}
      <section className={styles.surface} aria-label="Müşteri çalışma alanı">
        <form
          className={styles.customerToolbar}
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(searchInput.trim());
          }}
        >
          <label className={styles.customerSearch}>
            <span className="sr-only">Müşteri ara</span>
            <Search aria-hidden="true" />
            <input
              aria-label="Müşteri ara"
              placeholder="Ad, e-posta veya telefon ara"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              maxLength={200}
            />
            <button type="submit">Ara</button>
          </label>
          <label className={styles.customerFilter}>
            <span className="sr-only">Müşteri durumu</span>
            <SlidersHorizontal aria-hidden="true" />
            <select
              value={status}
              onChange={(e) =>
                setStatus(e.target.value as CustomerStatus | "all")
              }
            >
              <option value="all">Tüm müşteriler</option>
              <option value="active">Aktif</option>
              <option value="archived">Arşiv</option>
            </select>
          </label>
          <button
            className={styles.customerExport}
            type="button"
            disabled={exporting}
            onClick={() => void exportCsv()}
          >
            <Download aria-hidden="true" />{exporting ? "CSV hazırlanıyor…" : "CSV Dışa Aktar"}
          </button>
        </form>
        {activeFilters > 0 ? <div className={styles.appliedFilters} aria-label="Uygulanan filtreler"><span>{activeFilters} filtre{search ? ` · “${search}”` : ""}{status !== "all" ? ` · ${status === "active" ? "Aktif" : "Arşiv"}` : ""}</span><button type="button" onClick={clearFilters}>Filtreleri temizle</button></div> : null}
        {error && state !== "error" ? (
          <p className={styles.customerInlineError} role="alert">
            {error}
          </p>
        ) : null}
        {state === "loading" ? (
          <div className={styles.customerLoading} role="status">
            <RefreshCcw aria-hidden="true" />
            <div><strong>Müşteriler yükleniyor</strong><span>Müşteri kayıtları hazırlanıyor.</span></div>
          </div>
        ) : state === "error" ? (
          <div className={styles.customerError} role="alert">
            <div><strong>Müşteriler yüklenemedi</strong><p>{error}</p></div>
            <button type="button" onClick={() => void load(false)}>Tekrar dene</button>
          </div>
        ) : items.length === 0 ? (
          <div className={styles.customerEmpty}>
            <span><UsersRound aria-hidden="true" /></span>
            <strong>{search || status !== "all" ? "Filtrelerle eşleşen müşteri bulunamadı." : "Henüz müşteri yok."}</strong>
            <p>{search || status !== "all" ? "Arama veya müşteri filtresini değiştirerek yeniden deneyin." : "İlk müşteri kaydı oluşturulduğunda burada görünecek."}</p>
            {canManage && !search && status === "all" ? <Link className={styles.customerEmptyAction} href="/customers/new"><UserPlus aria-hidden="true" />Yeni Müşteri</Link> : null}
            {activeFilters > 0 ? <button className={styles.button} type="button" onClick={clearFilters}>Filtreleri temizle</button> : null}
          </div>
        ) : (
          <>
            <div className={styles.customerTableWrap} role="region" aria-label="Müşteri tablosu" tabIndex={0}>
              <table className={styles.customerTable} aria-label="Müşteri listesi">
                <thead>
                  <tr>
                    <th scope="col">Müşteri</th>
                    <th scope="col">İletişim</th>
                    <th scope="col">Etiketler</th>
                    <th scope="col" className={styles.customerNumericHeading}>Sipariş</th>
                    <th scope="col" className={styles.customerNumericHeading}>Toplam</th>
                    <th scope="col">Durum</th>
                    <th scope="col">Güncelleme</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((c) => (
                    <tr key={c.id}>
                      <td className={styles.customerNameCell}>
                        <Link
                          className={styles.customerNameLink}
                          href={`/customers/${c.id}`}
                        >
                          {c.displayName}
                        </Link>
                      </td>
                      <td className={styles.customerContactCell}>
                        <span>{c.email ?? "E-posta yok"}</span>
                        <small>{c.phone ?? "Telefon yok"}</small>
                      </td>
                      <td className={styles.customerTagsCell}>
                        {c.tags.length > 0 ? <div className={styles.customerTags} title={c.tags.map((tag) => tag.name).join(", ")}>
                          {c.tags.slice(0, 2).map((tag) => <span key={tag.id}>{tag.name}</span>)}
                          {c.tags.length > 2 ? <span>+{c.tags.length - 2}</span> : null}
                        </div> : <span className={styles.customerEmptyValue}>—</span>}
                      </td>
                      <td className={styles.customerOrderCell}>{c.orderCount.toLocaleString("tr-TR")}</td>
                      <td className={`${styles.customerTotalCell} ${c.totalSpentCents === 0 ? styles.customerZeroTotal : ""}`}><strong>{money(c.totalSpentCents, c.currency)}</strong></td>
                      <td className={styles.customerStatusCell}>
                        <PanelStatusBadge
                          tone={c.status === "active" ? "success" : "neutral"}
                        >
                          {c.status === "active" ? "Aktif" : "Arşiv"}
                        </PanelStatusBadge>
                      </td>
                      <td className={styles.customerDateCell}><time dateTime={c.updatedAt}>{date(c.updatedAt)}</time></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className={styles.customerCards}>
              {items.map((c) => (
                <article className={styles.customerCard} key={c.id}>
                  <div className={styles.customerCardTop}>
                    <div>
                    <Link
                      className={styles.customerNameLink}
                      href={`/customers/${c.id}`}
                    >
                      {c.displayName}
                    </Link>
                      <small>{c.email ?? "E-posta yok"}</small>
                      <small>{c.phone ?? "Telefon yok"}</small>
                    </div>
                    <PanelStatusBadge
                      tone={c.status === "active" ? "success" : "neutral"}
                    >
                      {c.status === "active" ? "Aktif" : "Arşiv"}
                    </PanelStatusBadge>
                  </div>
                  <dl className={styles.customerCardFacts}>
                    <div className={styles.fact}>
                      <dt>Toplam</dt>
                      <dd className={c.totalSpentCents === 0 ? styles.customerZeroTotal : styles.customerCardTotal}>{money(c.totalSpentCents, c.currency)}</dd>
                    </div>
                    <div className={styles.fact}><dt>Sipariş</dt><dd>{c.orderCount.toLocaleString("tr-TR")}</dd></div>
                    <div className={styles.fact}><dt>Güncelleme</dt><dd><time dateTime={c.updatedAt}>{date(c.updatedAt)}</time></dd></div>
                  </dl>
                  {c.tags.length > 0 ? <div className={styles.customerTags}>{c.tags.map((tag) => <span key={tag.id}>{tag.name}</span>)}</div> : null}
                  <Link className={styles.customerDetailAction} href={`/customers/${c.id}`}>İncele<ArrowRight aria-hidden="true" /></Link>
                </article>
              ))}
            </div>
            {cursor ? (
              <div className={styles.customerPagination}>
                {appendError ? <p className={styles.customerInlineError} role="alert">{appendError}</p> : null}
                <button
                  className={styles.customerLoadMore}
                  type="button"
                  disabled={loadingMore}
                  onClick={() => void load(true)}
                >
                  {loadingMore ? "Daha fazla yükleniyor…" : appendError ? "Daha fazla yüklemeyi tekrar dene" : "Daha fazla yükle"}
                </button>
              </div>
            ) : null}
            <p className={styles.loadedCount} role="status">{items.length.toLocaleString("tr-TR")} müşteri gösteriliyor{cursor ? " · Devamı var" : ""}</p>
          </>
        )}
      </section>
    </PanelPageShell>
  );
}
