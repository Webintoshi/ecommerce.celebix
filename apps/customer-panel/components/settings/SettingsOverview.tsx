"use client";

import Link from "next/link";
import { BarChart3, Bell, Building2, ChevronRight, CreditCard, Globe2, Languages, Palette, Search, Settings, Sparkles, Tags, Truck, Users, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { PanelPageHeader, PanelPageShell } from "@/components/panel/PanelPageShell";
import { SETTINGS_GROUPS } from "./settings-navigation";
import styles from "./settings-workspace.module.css";

const ICONS = { store: Building2, globe: Globe2, language: Languages, users: Users, card: CreditCard, tags: Tags, truck: Truck, bell: Bell, chart: BarChart3, sparkles: Sparkles, palette: Palette, settings: Settings };

export function SettingsOverview({ embedded = false }: { embedded?: boolean }) {
  const [query, setQuery] = useState("");
  const search = useRef<HTMLInputElement>(null);
  const normalized = query.trim().toLocaleLowerCase("tr-TR");
  const groups = SETTINGS_GROUPS.map((group) => ({ ...group, items: group.items.filter((item) => `${item.label} ${item.description} ${group.title}`.toLocaleLowerCase("tr-TR").includes(normalized)) })).filter((group) => group.items.length > 0);

  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey || event.target instanceof HTMLElement && (event.target.closest("input, textarea, select") || event.target.isContentEditable)) return;
      event.preventDefault();
      search.current?.focus();
    }
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);

  return <PanelPageShell embedded={embedded}>
    <PanelPageHeader title="Ayarlar" embedded={embedded} />
    <div className={styles.hubToolbar}>
      <label className={styles.search}><Search size={18} aria-hidden="true" /><span className={styles.srOnly}>Ayarlarda ara</span><input ref={search} type="search" aria-label="Ayarlarda ara" placeholder="Ayarlarda ara" autoComplete="off" value={query} onChange={(event) => setQuery(event.target.value)} />
        {query ? <button type="button" aria-label="Aramayı temizle" onClick={() => { setQuery(""); search.current?.focus(); }}><X size={16} aria-hidden="true" /></button> : <kbd>/</kbd>}
      </label>
      <span className={styles.resultCount} role="status">{normalized ? `${groups.reduce((count, group) => count + group.items.length, 0)} sonuç` : null}</span>
    </div>
    <nav className={styles.settingsGroups} aria-label="Ayar bölümleri">
      {groups.map((group) => <section className={styles.settingsGroup} key={group.title} aria-labelledby={`settings-group-${group.illustration}`}>
        <div className={styles.groupTop}><h2 id={`settings-group-${group.illustration}`}>{group.title}</h2><img src={`/illustrations/settings/${group.illustration}.svg`} width={150} height={100} alt="" aria-hidden="true" /></div>
        <div>{group.items.map(({ href, label, description, icon }) => { const Icon = ICONS[icon]; return <Link className={styles.settingsRow} key={href} href={href}><Icon size={20} strokeWidth={1.7} aria-hidden="true" /><div><strong>{label}</strong><small>{description}</small></div><ChevronRight className={styles.settingsArrow} size={18} aria-hidden="true" /></Link>; })}</div>
      </section>)}
    </nav>
    {!groups.length ? <div className={styles.empty}><img src="/illustrations/settings/store.svg" width={150} height={100} alt="" /><strong>Eşleşen ayar yok</strong><button type="button" onClick={() => { setQuery(""); search.current?.focus(); }}>Aramayı temizle</button></div> : null}
    <footer className={styles.assetCredits}><details><summary>Görsel kaynakları</summary><a href="https://www.flaticon.com/free-icon/whatsapp_3781677" target="_blank" rel="noopener noreferrer">WhatsApp simgesi: designed by Magnific from Flaticon</a></details></footer>
  </PanelPageShell>;
}
