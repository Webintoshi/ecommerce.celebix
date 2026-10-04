"use client";
import { useEffect, useId, useRef, useState, type FormEvent, type MouseEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { isValidProductCatalogSearch } from "../lib/product-catalog-query.ts";
import type { SearchSuggestion } from "../lib/search-suggestions.ts";

export function StorefrontSearchForm({ defaultValue = "", variant = "page", icon, clientNavigation = false, onNavigate }: Readonly<{ defaultValue?: string; variant?: "page" | "header" | "panel"; icon?: ReactNode; clientNavigation?: boolean; onNavigate?: (href: string) => void }>) {
  const router = useRouter(), id = useId();
  const inputRef = useRef<HTMLInputElement>(null), requestRef = useRef<AbortController | null>(null);
  const [query, setQuery] = useState(defaultValue), [items, setItems] = useState<readonly SearchSuggestion[]>([]);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [open, setOpen] = useState(false), [active, setActive] = useState(-1);
  useEffect(() => {
    requestRef.current?.abort();
    const controller = new AbortController(); requestRef.current = controller;
    const value = query.trim(); setItems([]); setActive(-1);
    if (!open || value.length < 2 || !isValidProductCatalogSearch(value) || /[\u0080-\u009f]/u.test(value)) { setState("idle"); return () => controller.abort(); }
    setState("loading");
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/search/suggestions?q=${encodeURIComponent(value)}`, { signal: controller.signal, cache: "no-store", credentials: "same-origin" });
        if (!response.ok) throw new Error("unavailable");
        const body = await response.json();
        if (!Array.isArray(body.items) || body.items.length > 8) throw new Error("invalid_results");
        const selected: SearchSuggestion[] = body.items.filter((item: SearchSuggestion) => item && typeof item.title === "string" && typeof item.href === "string" && /^\/(urun|products)\/[a-z0-9-]+$/u.test(item.href) && Number.isSafeInteger(item.priceCents) && item.priceCents >= 0);
        if (!controller.signal.aborted) { setItems(selected); setState("ready"); }
      } catch { if (!controller.signal.aborted) setState("error"); }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, open]);
  const close = () => { setOpen(false); requestRef.current?.abort(); };
  const navigate = (href: string) => { if (onNavigate) onNavigate(href); else router.push(href); };
  const follow = (event: MouseEvent<HTMLAnchorElement>, href: string) => {
    close();
    if ((!clientNavigation && !onNavigate) || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(href);
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = String(new FormData(event.currentTarget).get("q") ?? "").trim();
    if (!value || !isValidProductCatalogSearch(value) || /[\u0080-\u009f]/u.test(value)) {
      inputRef.current?.setCustomValidity(!value ? "Aramak istediğiniz ürünü yazın." : "Lütfen daha kısa bir arama metni yazın."); inputRef.current?.reportValidity(); return;
    }
    close(); navigate(`/search?q=${encodeURIComponent(value)}`);
  };
  const input = <input id={`${id}-input`} ref={inputRef} name="q" type="search" defaultValue={defaultValue} placeholder={variant === "header" ? "Ara" : variant === "panel" ? "Ürün veya kategori ara" : "Ne aramıştınız?"} autoFocus={variant === "panel"} autoComplete="off" enterKeyHint="search" required maxLength={100}
    role="combobox" aria-autocomplete="list" aria-controls={`${id}-results`} aria-expanded={open && state !== "idle"} aria-activedescendant={active >= 0 ? `${id}-item-${active}` : undefined}
    onInput={event => { event.currentTarget.setCustomValidity(""); requestRef.current?.abort(); setQuery(event.currentTarget.value); setOpen(true); }} onFocus={() => setOpen(true)}
    onKeyDown={event => {
      if (event.nativeEvent.isComposing) return;
      if (event.key === "Escape") close();
      if (items.length && (event.key === "ArrowDown" || event.key === "ArrowUp")) { event.preventDefault(); setOpen(true); setActive(index => event.key === "ArrowDown" ? (index + 1) % items.length : (index <= 0 ? items.length - 1 : index - 1)); }
      if (open && active >= 0 && event.key === "Enter") { event.preventDefault(); close(); navigate(items[active].href); }
    }} />;
  return <form className={variant === "header" ? "siora-header-search store-live-search" : variant === "panel" ? "guzide-panel-search store-live-search" : "store-search-form store-live-search"} action="/search" method="get" role="search" onSubmit={submit}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) close(); }}>
    {variant === "header" || variant === "panel" ? <><button type="submit" aria-label="Ürün ara">{icon ?? "Ara"}</button><label className="sr-only" htmlFor={`${id}-input`}>Ürün adı veya anahtar kelime</label>{input}</> : <><label htmlFor={`${id}-input`}>Ürün adı, ürün kodu, barkod, marka veya kategori</label><div>{input}<button className="store-button" type="submit">Ara</button></div></>}
    {open && state !== "idle" ? <aside className="store-search-suggestions" aria-label="Arama önerileri">
      <p className="store-search-status" role="status">{state === "loading" ? "Ürünler aranıyor…" : state === "error" ? "Öneriler alınamadı. Ara düğmesiyle tekrar deneyebilirsiniz." : items.length ? "Eşleşen ürünler" : "Eşleşen ürün bulunamadı."}</p>
      <ul id={`${id}-results`} role="listbox" aria-label="Ürünler">{items.map((item, index) => <li id={`${id}-item-${index}`} key={item.id} role="option" aria-selected={active === index}>
        <a href={item.href} onClick={event => follow(event, item.href)}>
          {item.imageUrl ? <img src={item.imageUrl} alt={item.imageAlt} width={48} height={48} loading="lazy" /> : <span className="store-search-image-placeholder" aria-hidden="true">◇</span>}
          <span>{item.title}{!item.available ? <small>Tükendi</small> : null}</span>
          <strong>{new Intl.NumberFormat("tr-TR", { style: "currency", currency: item.currency }).format(item.priceCents / 100)}</strong>
        </a>
      </li>)}</ul>
      {state === "ready" && items.length ? <a className="store-search-all" href={`/search?q=${encodeURIComponent(query.trim())}`} onClick={clientNavigation || onNavigate ? event => follow(event, `/search?q=${encodeURIComponent(query.trim())}`) : undefined}>Tüm sonuçları gör →</a> : null}
    </aside> : null}
  </form>;
}
