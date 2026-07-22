"use client";
import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type {
  CustomerDetail,
  CustomerSegment,
  CustomerTag,
} from "@celebix/saas-contracts";
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
function msg(e: unknown) {
  return e instanceof CustomerApiError
    ? e.message
    : "Müşteri kaydı yüklenemedi.";
}
export function CustomerDetailConsole({
  customerId,
  canManage,
  canArchive,
}: {
  customerId: string;
  canManage: boolean;
  canArchive: boolean;
}) {
  const [data, setData] = useState<CustomerDetail | null>(null),
    [tags, setTags] = useState<readonly CustomerTag[]>([]),
    [segments, setSegments] = useState<readonly CustomerSegment[]>([]),
    [state, setState] = useState<"loading" | "loaded" | "error">("loading"),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setState("loading");
    try {
      const [d, t, s] = await Promise.all([
        customerApi.get(customerId),
        customerApi.tags(),
        customerApi.segments(),
      ]);
      setData(d);
      setTags(t);
      setSegments(s);
      setState("loaded");
    } catch (e) {
      setError(msg(e));
      setState("error");
    }
  }, [customerId]);
  useEffect(() => {
    void load();
  }, [load]);
  async function note(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!data) return;
    const form = e.currentTarget,
      text = String(new FormData(form).get("text") ?? "").trim();
    setBusy(true);
    try {
      await customerApi.addNote(customerId, text);
      form.reset();
      setNotice("Not kaydedildi.");
      await load();
    } catch (x) {
      setError(msg(x));
    } finally {
      setBusy(false);
    }
  }
  async function assign(kind: "tags" | "segments", ids: string[]) {
    setBusy(true);
    try {
      kind === "tags"
        ? await customerApi.setTags(customerId, ids)
        : await customerApi.setSegments(customerId, ids);
      setNotice(
        kind === "tags" ? "Etiketler güncellendi." : "Segmentler güncellendi.",
      );
      await load();
    } catch (x) {
      setError(msg(x));
    } finally {
      setBusy(false);
    }
  }
  async function updateProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data) return;
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "")
      .trim()
      .toLowerCase();
    const phone = String(form.get("phone") ?? "").trim();
    setBusy(true);
    setError("");
    try {
      await customerApi.update(customerId, {
        firstName: String(form.get("firstName") ?? "").trim(),
        lastName: String(form.get("lastName") ?? "").trim(),
        ...(email ? { email } : {}),
        ...(phone ? { phone } : {}),
        addresses: data.addresses.map((address) => ({
          id: address.id,
          label: address.label,
          recipientName: address.recipientName,
          line1: address.line1,
          ...(address.line2 ? { line2: address.line2 } : {}),
          city: address.city,
          ...(address.district ? { district: address.district } : {}),
          ...(address.postalCode ? { postalCode: address.postalCode } : {}),
          country: address.country,
          isDefault: address.isDefault,
        })),
        consents: (["email", "phone", "whatsapp"] as const).map((channel) => ({
          channel,
          status:
            form.get(`${channel}Consent`) === "on"
              ? ("granted" as const)
              : ("denied" as const),
        })),
        expectedVersion: data.version,
      });
      setNotice("Müşteri bilgileri güncellendi.");
      await load();
    } catch (failure) {
      setError(msg(failure));
    } finally {
      setBusy(false);
    }
  }
  async function archive() {
    if (!data) return;
    setBusy(true);
    try {
      await customerApi.archive(customerId, data.version);
      setNotice("Müşteri arşivlendi.");
      await load();
    } catch (x) {
      setError(msg(x));
    } finally {
      setBusy(false);
    }
  }
  if (state === "loading")
    return (
      <PanelPageShell>
        <div className={styles.state} role="status">
          Müşteri yükleniyor…
        </div>
      </PanelPageShell>
    );
  if (state === "error" || !data)
    return (
      <PanelPageShell>
        <div className={styles.state} role="alert">
          <div>
            <p className={styles.error}>{error}</p>
            <button className={styles.button} onClick={() => void load()}>
              Tekrar dene
            </button>
          </div>
        </div>
      </PanelPageShell>
    );
  return (
    <PanelPageShell>
      <Link className={styles.back} href="/customers">
        ← Müşterilere dön
      </Link>
      <PanelPageHeader
        title={data.displayName}
        description="İletişim, izin, adres, not ve müşteri gruplarını yönetin."
        actions={
          <PanelStatusBadge
            tone={data.status === "active" ? "success" : "neutral"}
          >
            {data.status === "active" ? "Aktif" : "Arşiv"}
          </PanelStatusBadge>
        }
      />
      {notice ? (
        <p className={styles.notice} role="status">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      <section className={`${styles.detail} ${styles.detailHero}`}>
        <div>
          <span>E-posta</span>
          <strong>{data.email ?? "—"}</strong>
        </div>
        <div>
          <span>Telefon</span>
          <strong>{data.phone ?? "—"}</strong>
        </div>
        <div>
          <span>Siparişler</span>
          <strong>{data.orderCount}</strong>
        </div>
        <div>
          <span>Toplam harcama</span>
          <strong>{money(data.totalSpentCents, data.currency)}</strong>
        </div>
      </section>
      {canManage && data.status === "active" ? (
        <section className={styles.detail}>
          <div className={styles.heading}>
            <div>
              <h2>Müşteri bilgileri</h2>
              <p>Ad, iletişim ve kanal izinlerini güncelleyin.</p>
            </div>
          </div>
          <form
            className={`${styles.panel} ${styles.form}`}
            onSubmit={updateProfile}
          >
            <div className={styles.grid}>
              <label>
                Ad
                <input
                  name="firstName"
                  defaultValue={data.firstName}
                  required
                  maxLength={100}
                />
              </label>
              <label>
                Soyad
                <input
                  name="lastName"
                  defaultValue={data.lastName}
                  required
                  maxLength={100}
                />
              </label>
              <label>
                E-posta
                <input
                  name="email"
                  type="email"
                  defaultValue={data.email ?? ""}
                  maxLength={320}
                />
              </label>
              <label>
                Telefon
                <input
                  name="phone"
                  type="tel"
                  defaultValue={data.phone ?? ""}
                  maxLength={16}
                />
              </label>
            </div>
            <div className={styles.checks}>
              {(["email", "phone", "whatsapp"] as const).map((channel) => (
                <label className={styles.check} key={channel}>
                  <input
                    name={`${channel}Consent`}
                    type="checkbox"
                    defaultChecked={data.consents.some(
                      (consent) =>
                        consent.channel === channel &&
                        consent.status === "granted",
                    )}
                  />
                  {channel === "email"
                    ? "E-posta"
                    : channel === "phone"
                      ? "Telefon"
                      : "WhatsApp"}
                </label>
              ))}
            </div>
            <div className={styles.actions}>
              <button className={styles.primary} disabled={busy}>
                Değişiklikleri Kaydet
              </button>
            </div>
          </form>
        </section>
      ) : null}
      <div className={styles.columns}>
        <section className={styles.detail}>
          <div className={styles.heading}>
            <div>
              <h2>Adresler</h2>
              <p>{data.addresses.length} kayıt</p>
            </div>
          </div>
          <div className={`${styles.panel} ${styles.addressList}`}>
            {data.addresses.length ? (
              data.addresses.map((a) => (
                <article key={a.id}>
                  <strong>
                    {a.label}
                    {a.isDefault ? " · Varsayılan" : ""}
                  </strong>
                  <div>{a.recipientName}</div>
                  <div>
                    {a.line1}
                    {a.line2 ? `, ${a.line2}` : ""}
                  </div>
                  <div>
                    {a.district ? `${a.district}, ` : ""}
                    {a.city} {a.postalCode ?? ""} · {a.country}
                  </div>
                </article>
              ))
            ) : (
              <p>Adres kaydı yok.</p>
            )}
          </div>
        </section>
        <section className={styles.detail}>
          <div className={styles.heading}>
            <div>
              <h2>İletişim izinleri</h2>
              <p>Kanal bazlı doğrulanmış durum</p>
            </div>
          </div>
          <div className={styles.panel}>
            {data.consents.map((c) => (
              <div className={styles.taxonomyItem} key={c.channel}>
                <strong>
                  {c.channel === "email"
                    ? "E-posta"
                    : c.channel === "phone"
                      ? "Telefon"
                      : "WhatsApp"}
                </strong>
                <PanelStatusBadge
                  tone={c.status === "granted" ? "success" : "neutral"}
                >
                  {c.status === "granted" ? "İzinli" : "Reddedildi"}
                </PanelStatusBadge>
              </div>
            ))}
          </div>
        </section>
      </div>
      <div className={styles.columns}>
        <section className={styles.detail}>
          <div className={styles.heading}>
            <div>
              <h2>Etiketler</h2>
              <p>Müşteri sınıflandırması</p>
            </div>
          </div>
          <div className={styles.panel}>
            {tags.length ? (
              <div className={styles.checks}>
                {tags.map((t) => (
                  <label className={styles.check} key={t.id}>
                    <input
                      type="checkbox"
                      disabled={!canManage || busy}
                      checked={data.tags.some((x) => x.id === t.id)}
                      onChange={(e) => {
                        const ids = e.target.checked
                          ? [...data.tags.map((x) => x.id), t.id]
                          : data.tags
                              .filter((x) => x.id !== t.id)
                              .map((x) => x.id);
                        void assign("tags", ids);
                      }}
                    />
                    <span
                      className={styles.color}
                      style={{ background: t.color }}
                    />
                    {t.name}
                  </label>
                ))}
              </div>
            ) : (
              <p>Önce Etiketler ekranından etiket oluşturun.</p>
            )}
          </div>
        </section>
        <section className={styles.detail}>
          <div className={styles.heading}>
            <div>
              <h2>Segmentler</h2>
              <p>Manuel müşteri grupları</p>
            </div>
          </div>
          <div className={styles.panel}>
            {segments.length ? (
              <div className={styles.checks}>
                {segments.map((s) => (
                  <label className={styles.check} key={s.id}>
                    <input
                      type="checkbox"
                      disabled={!canManage || busy}
                      checked={data.segments.some((x) => x.id === s.id)}
                      onChange={(e) => {
                        const ids = e.target.checked
                          ? [...data.segments.map((x) => x.id), s.id]
                          : data.segments
                              .filter((x) => x.id !== s.id)
                              .map((x) => x.id);
                        void assign("segments", ids);
                      }}
                    />
                    {s.name}
                  </label>
                ))}
              </div>
            ) : (
              <p>Önce Segmentler ekranından segment oluşturun.</p>
            )}
          </div>
        </section>
      </div>
      <section className={styles.detail}>
        <div className={styles.heading}>
          <div>
            <h2>Dahili notlar</h2>
            <p>Yalnız mağaza ekibi tarafından görülebilir.</p>
          </div>
        </div>
        {canManage && data.status === "active" ? (
          <form
            className={`${styles.panel} ${styles.noteForm}`}
            onSubmit={note}
          >
            <label>
              Yeni not
              <textarea name="text" required maxLength={2000} />
            </label>
            <button className={styles.primary} disabled={busy}>
              Notu Kaydet
            </button>
          </form>
        ) : null}
        <div className={`${styles.panel} ${styles.noteList}`}>
          {data.notes.length ? (
            data.notes.map((n) => (
              <article key={n.id}>
                <p>{n.text}</p>
                <small>
                  {new Intl.DateTimeFormat("tr-TR", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(n.createdAt))}
                </small>
              </article>
            ))
          ) : (
            <p>Henüz dahili not yok.</p>
          )}
        </div>
      </section>
      {canArchive && data.status === "active" ? (
        <div className={styles.actions}>
          <button
            className={styles.danger}
            disabled={busy}
            onClick={() => void archive()}
          >
            Müşteriyi Arşivle
          </button>
        </div>
      ) : null}
    </PanelPageShell>
  );
}
