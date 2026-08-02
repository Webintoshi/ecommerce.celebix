"use client";

import type { CatalogCategory, MerchantAdminRecord, StarterFooterConfig, StarterFooterLinkConfig, StarterSocialNetwork } from "@celebix/saas-contracts";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import styles from "./starter-theme-composer.module.css";

const POLICIES = Object.freeze([
  ["privacy_security", "Gizlilik ve Güvenlik"], ["distance_sales", "Mesafeli Satış Sözleşmesi"], ["kvkk", "KVKK"],
  ["payment_delivery", "Ödeme ve Teslimat"], ["cookie_usage", "Çerez Kullanımı"], ["returns_exchange", "İade ve Değişim"], ["membership", "Üyelik"],
] as const);
const SYSTEM_LINKS = Object.freeze([["/", "Ana sayfa"], ["/products", "Ürünler"], ["/favorites", "Favoriler"], ["/account", "Hesabım"]] as const);
const NETWORKS = Object.freeze(["instagram", "facebook", "youtube", "pinterest", "tiktok", "x"] as const);
const SOCIAL_HOSTS: Readonly<Record<StarterSocialNetwork, readonly string[]>> = Object.freeze({
  instagram: ["instagram.com", "www.instagram.com"], facebook: ["facebook.com", "www.facebook.com"], youtube: ["youtube.com", "www.youtube.com"],
  pinterest: ["pinterest.com", "www.pinterest.com"], tiktok: ["tiktok.com", "www.tiktok.com"], x: ["x.com", "www.x.com"],
});

function reviewedSocialUrl(network: StarterSocialNetwork, value: string): string | null {
  if (value !== value.trim() || value.length > 512) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port && !url.search && !url.hash && url.pathname !== "/" && url.toString() === value && SOCIAL_HOSTS[network].includes(url.hostname) ? value : null;
  } catch { return null; }
}

function replacement(kind: StarterFooterLinkConfig["kind"], categories: readonly CatalogCategory[], pages: readonly MerchantAdminRecord[]): StarterFooterLinkConfig | null {
  if (kind === "fixed_policy") return Object.freeze({ kind, policyKey: "privacy_security" });
  if (kind === "category") return categories[0] ? Object.freeze({ kind, categoryId: categories[0].id }) : null;
  if (kind === "page") return pages[0] ? Object.freeze({ kind, pageId: pages[0].id }) : null;
  return Object.freeze({ kind, destination: "/products" });
}

export function StarterFooterEditor({ categories, disabled, pages, update, value }: Readonly<{
  categories: readonly CatalogCategory[];
  disabled: boolean;
  pages: readonly MerchantAdminRecord[];
  update: (footer: StarterFooterConfig) => void;
  value: StarterFooterConfig;
}>) {
  const [network, setNetwork] = useState<StarterSocialNetwork>("instagram");
  const [profileUrl, setProfileUrl] = useState("");
  const [socialError, setSocialError] = useState("");
  const patchGroup = (groupIndex: number, patch: Partial<StarterFooterConfig["groups"][number]>) => update({ ...value, groups: Object.freeze(value.groups.map((group, index) => index === groupIndex ? Object.freeze({ ...group, ...patch }) : group)) });
  const patchLink = (groupIndex: number, linkIndex: number, link: StarterFooterLinkConfig) => patchGroup(groupIndex, { links: Object.freeze(value.groups[groupIndex]!.links.map((entry, index) => index === linkIndex ? link : entry)) });

  function addSocial() {
    const valid = reviewedSocialUrl(network, profileUrl);
    if (!valid) { setSocialError("HTTPS profil adresi seçilen sosyal ağa ait, sorgusuz ve eksiksiz olmalıdır."); return; }
    if (value.social.some((item) => item.network === network)) { setSocialError("Bu sosyal ağ zaten eklendi."); return; }
    update({ ...value, social: Object.freeze([...value.social, Object.freeze({ network, url: valid })]) });
    setProfileUrl(""); setSocialError("");
  }

  return <fieldset className={styles.panel} disabled={disabled}>
    <legend>Footer</legend>
    <div className={styles.fieldGrid}><label>Footer tonu<select value={value.tone} onChange={(event) => update({ ...value, tone: event.currentTarget.value as "light" | "dark" })}><option value="dark">Koyu</option><option value="light">Açık</option></select></label></div>
    <div className={styles.entryList}>{value.groups.map((group, groupIndex) => <fieldset className={styles.entryCard} key={groupIndex}>
      <legend>Bağlantı grubu {groupIndex + 1}</legend>
      <label>Grup başlığı<input maxLength={80} value={group.heading} onChange={(event) => patchGroup(groupIndex, { heading: event.currentTarget.value })} /></label>
      <div className={styles.footerLinks}>{group.links.map((link, linkIndex) => <div className={styles.footerLink} key={`${link.kind}-${linkIndex}`}>
        <label>Bağlantı türü<select value={link.kind} onChange={(event) => { const next = replacement(event.currentTarget.value as StarterFooterLinkConfig["kind"], categories, pages); if (next) patchLink(groupIndex, linkIndex, next); }}><option value="fixed_policy">Sabit politika</option><option value="category" disabled={!categories.length}>Kategori</option><option value="page" disabled={!pages.length}>Sayfa</option><option value="system">Sistem sayfası</option></select></label>
        {link.kind === "fixed_policy" ? <label>Politika<select value={link.policyKey} onChange={(event) => patchLink(groupIndex, linkIndex, { kind: "fixed_policy", policyKey: event.currentTarget.value as typeof link.policyKey })}>{POLICIES.map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label> : null}
        {link.kind === "category" ? <label>Kategori<select value={link.categoryId} onChange={(event) => patchLink(groupIndex, linkIndex, { kind: "category", categoryId: event.currentTarget.value })}>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label> : null}
        {link.kind === "page" ? <label>Sayfa<select value={link.pageId} onChange={(event) => patchLink(groupIndex, linkIndex, { kind: "page", pageId: event.currentTarget.value })}>{pages.map((page) => <option key={page.id} value={page.id}>{page.name}</option>)}</select></label> : null}
        {link.kind === "system" ? <label>Sistem hedefi<select value={link.destination} onChange={(event) => patchLink(groupIndex, linkIndex, { kind: "system", destination: event.currentTarget.value as typeof link.destination })}>{SYSTEM_LINKS.map(([destination, label]) => <option key={destination} value={destination}>{label}</option>)}</select></label> : null}
        <button type="button" aria-label={`${group.heading} grubundan bağlantıyı kaldır`} onClick={() => patchGroup(groupIndex, { links: Object.freeze(group.links.filter((_, index) => index !== linkIndex)) })} disabled={group.links.length <= 1}><Trash2 aria-hidden="true" /></button>
      </div>)}</div>
      <div className={styles.entryToolbar}><button type="button" onClick={() => patchGroup(groupIndex, { links: Object.freeze([...group.links, Object.freeze({ kind: "system", destination: "/products" })]) })} disabled={group.links.length >= 8}><Plus aria-hidden="true" /> Bağlantı ekle</button><button type="button" onClick={() => update({ ...value, groups: Object.freeze(value.groups.filter((_, index) => index !== groupIndex)) })} disabled={value.groups.length <= 2}><Trash2 aria-hidden="true" /> Grubu kaldır</button></div>
    </fieldset>)}</div>
    <button className={styles.entryAdd} type="button" onClick={() => update({ ...value, groups: Object.freeze([...value.groups, Object.freeze({ heading: `Yeni grup ${value.groups.length + 1}`, links: Object.freeze([Object.freeze({ kind: "system", destination: "/products" })]) })]) })} disabled={value.groups.length >= 4}><Plus aria-hidden="true" /> Footer grubu ekle</button>

    <fieldset className={styles.entryCard}><legend>Bülten</legend><label className={styles.check}><input type="checkbox" checked={value.newsletter.enabled} onChange={(event) => update({ ...value, newsletter: { ...value.newsletter, enabled: event.currentTarget.checked } })} /> Bülten aboneliğini göster</label><div className={styles.fieldGrid}><label>Başlık<input maxLength={120} value={value.newsletter.heading} onChange={(event) => update({ ...value, newsletter: { ...value.newsletter, heading: event.currentTarget.value } })} /></label><label className={styles.wide}>Açıklama<textarea maxLength={500} value={value.newsletter.body} onChange={(event) => update({ ...value, newsletter: { ...value.newsletter, body: event.currentTarget.value } })} /></label><label className={styles.wide}>Onay metni<textarea maxLength={300} value={value.newsletter.consentLabel} onChange={(event) => update({ ...value, newsletter: { ...value.newsletter, consentLabel: event.currentTarget.value } })} /></label></div></fieldset>

    <fieldset className={styles.entryCard}><legend>Sosyal profiller</legend><div className={styles.fieldGrid}><label>Ağ<select value={network} onChange={(event) => setNetwork(event.currentTarget.value as StarterSocialNetwork)}>{NETWORKS.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><label>Doğrulanmış profil URL&apos;si<input type="url" maxLength={512} placeholder={`https://www.${network}.com/magazaniz`} value={profileUrl} onChange={(event) => setProfileUrl(event.currentTarget.value)} /></label></div><button className={styles.entryAdd} type="button" onClick={addSocial} disabled={value.social.length >= 6}><Plus aria-hidden="true" /> Sosyal profil ekle</button>{socialError ? <p className={styles.error} role="alert">{socialError}</p> : null}<div className={styles.socialList}>{value.social.map((item) => <div key={item.network}><span><strong>{item.network}</strong><small>{item.url}</small></span><button type="button" aria-label={`${item.network} profilini kaldır`} onClick={() => update({ ...value, social: Object.freeze(value.social.filter(({ network: candidate }) => candidate !== item.network)) })}><Trash2 aria-hidden="true" /></button></div>)}</div></fieldset>
  </fieldset>;
}
