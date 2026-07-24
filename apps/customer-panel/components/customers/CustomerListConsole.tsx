"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type {
  CustomerListItem,
  CustomerStatus,
  CustomerSummary,
} from "@celebix/saas-contracts";
import {
  PanelEmptyState,
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
export function CustomerListConsole({ canManage }: { canManage: boolean }) {
  const [state, setState] = useState<"loading" | "loaded" | "error">("loading"),
    [items, setItems] = useState<readonly CustomerListItem[]>([]),
    [summary, setSummary] = useState<CustomerSummary | null>(null),
    [searchInput, setSearchInput] = useState(""),
    [search, setSearch] = useState(""),
    [status, setStatus] = useState<CustomerStatus | "all">("all"),
    [cursor, setCursor] = useState<string>(),
    [error, setError] = useState("");
  const load = useCallback(
    async (append = false) => {
      setState("loading");
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
        setSummary(s);
        setItems((old) =>
          append ? Object.freeze([...old, ...l.items]) : l.items,
        );
        setCursor(l.nextCursor);
        setState("loaded");
      } catch (e) {
        setError(message(e));
        setState("error");
      }
    },
    [cursor, search, status],
  );
  useEffect(() => {
    void load(false);
  }, [search, status]);
  async function exportCsv() {
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
    }
  }
  return (
    <PanelPageShell>
      <PanelPageHeader
        title="Müşteriler"
        description="Müşteri kayıtlarını, izinleri, etiketleri ve segmentleri tek yerden yönetin."
        actions={canManage ? (
          <Link className={styles.primary} href="/customers/new">
            Yeni Müşteri
          </Link>
        ) : undefined}
      />
      {summary ? (
        <section className={styles.metrics} aria-label="Müşteri özeti">
          <div className={styles.metric}>
            <span>Aktif müşteri</span>
            <strong>{summary.active}</strong>
          </div>
          <div className={styles.metric}>
            <span>Arşiv</span>
            <strong>{summary.archived}</strong>
          </div>
          <div className={styles.metric}>
            <span>E-posta izinli</span>
            <strong>{summary.consentedEmail}</strong>
          </div>
          <div className={styles.metric}>
            <span>Toplam harcama</span>
            <strong>{money(summary.totalSpentCents, summary.currency)}</strong>
          </div>
        </section>
      ) : null}
      <section className={styles.surface}>
        <div className={styles.heading}>
          <div>
            <h2>Tüm Müşteriler</h2>
            <p>Kalıcı mağaza verilerinden gelen güncel müşteri listesi.</p>
          </div>
        </div>
        <form
          className={styles.toolbar}
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(searchInput.trim());
          }}
        >
          <input
            aria-label="Müşteri ara"
            placeholder="Ad, e-posta veya telefon ara"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            maxLength={200}
          />
          <select
            aria-label="Müşteri durumu"
            value={status}
            onChange={(e) =>
              setStatus(e.target.value as CustomerStatus | "all")
            }
          >
            <option value="all">Tüm müşteriler</option>
            <option value="active">Aktif</option>
            <option value="archived">Arşiv</option>
          </select>
          <button className={styles.button} type="submit">
            Ara
          </button>
          <button
            className={styles.button}
            type="button"
            onClick={() => void exportCsv()}
          >
            CSV Dışa Aktar
          </button>
        </form>
        {state === "loading" ? (
          <div className={styles.state} role="status">
            Müşteriler yükleniyor…
          </div>
        ) : state === "error" ? (
          <div className={styles.state} role="alert">
            <div>
              <p className={styles.error}>{error}</p>
              <button
                className={styles.button}
                type="button"
                onClick={() => void load(false)}
              >
                Tekrar dene
              </button>
            </div>
          </div>
        ) : items.length === 0 ? (
          <PanelEmptyState
            title="Henüz müşteri yok"
            description="İlk gerçek müşteri kaydı oluşturulduğunda burada görünecek."
          />
        ) : (
          <>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Müşteri</th>
                    <th>İletişim</th>
                    <th>Etiketler</th>
                    <th>Sipariş</th>
                    <th>Toplam</th>
                    <th>Durum</th>
                    <th>Güncelleme</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <Link
                          className={styles.nameLink}
                          href={`/customers/${c.id}`}
                        >
                          {c.displayName}
                        </Link>
                      </td>
                      <td>
                        {c.email ?? "—"}
                        <small>{c.phone ?? ""}</small>
                      </td>
                      <td>
                        <div className={styles.tags}>
                          {c.tags.map((t) => (
                            <span className={styles.tag} key={t.id}>
                              {t.name}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td>{c.orderCount}</td>
                      <td>{money(c.totalSpentCents, c.currency)}</td>
                      <td>
                        <PanelStatusBadge
                          tone={c.status === "active" ? "success" : "neutral"}
                        >
                          {c.status === "active" ? "Aktif" : "Arşiv"}
                        </PanelStatusBadge>
                      </td>
                      <td>{date(c.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className={styles.cards}>
              {items.map((c) => (
                <article className={styles.card} key={c.id}>
                  <div className={styles.cardTop}>
                    <Link
                      className={styles.nameLink}
                      href={`/customers/${c.id}`}
                    >
                      {c.displayName}
                    </Link>
                    <PanelStatusBadge
                      tone={c.status === "active" ? "success" : "neutral"}
                    >
                      {c.status === "active" ? "Aktif" : "Arşiv"}
                    </PanelStatusBadge>
                  </div>
                  <dl className={styles.facts}>
                    <div className={styles.fact}>
                      <dt>İletişim</dt>
                      <dd>{c.email ?? c.phone ?? "—"}</dd>
                    </div>
                    <div className={styles.fact}>
                      <dt>Toplam</dt>
                      <dd>{money(c.totalSpentCents, c.currency)}</dd>
                    </div>
                  </dl>
                  <Link className={styles.button} href={`/customers/${c.id}`}>
                    Müşteri ayrıntısı
                  </Link>
                </article>
              ))}
            </div>
            {cursor ? (
              <button
                className={`${styles.button} ${styles.load}`}
                type="button"
                onClick={() => void load(true)}
              >
                Daha fazla yükle
              </button>
            ) : null}
          </>
        )}
      </section>
    </PanelPageShell>
  );
}
