"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { contactWidgetAvailability, contactWidgetPageType, resolveContactWidgetHref, shouldShowContactWidget, type ContactWidgetConfig, type PublicDesignMedia } from "@celebix/saas-contracts";
import { ContactChannelIcon, ContactLauncherIcon, ContactUtilityIcon } from "./ContactChannelIcon";
import styles from "./ContactWidget.module.css";

type ProductContext = Readonly<{ productTitle: string; productUrl: string }>;
type Environment = Readonly<{ pathname: string; device: "desktop" | "mobile"; blocked: boolean; mobileOffset: number; product: ProductContext | null }>;
const channelNames = { whatsapp: "WhatsApp", phone: "Telefon", sms: "SMS", email: "E-posta", instagram: "Instagram", telegram: "Telegram", messenger: "Messenger", maps: "Yol tarifi", contact_page: "İletişim sayfası" };
const channelDescriptions = { whatsapp: "Mesaj gönderin", phone: "Mağazayı arayın", sms: "SMS gönderin", email: "E-posta gönderin", instagram: "Instagram’da ziyaret edin", telegram: "Telegram üzerinden yazın", messenger: "Messenger üzerinden yazın", maps: "Konumu görüntüleyin", contact_page: "İletişim bilgilerini görüntüleyin" };

function visible(element: Element) {
  if (element.closest('[hidden], [aria-hidden="true"]')) return false;
  const style = window.getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden";
}

function productContext(pathname: string, hostname: string): ProductContext | null {
  if (!/^\/(?:products|urun)\/[^/]+\/?$/u.test(pathname)) return null;
  const marker = document.querySelector<HTMLElement>("[data-contact-product-title][data-contact-product-path]");
  const path = marker?.dataset.contactProductPath, title = marker?.dataset.contactProductTitle?.trim();
  if (!path || !title || !path.startsWith("/") || path.startsWith("//")) return null;
  try {
    const origin = new URL(`https://${hostname}`), route = new URL(path, origin);
    if (origin.hostname !== hostname || origin.username || origin.password || route.origin !== origin.origin || route.pathname.replace(/\/$/u, "") !== pathname.replace(/\/$/u, "")) return null;
    const url = new URL(marker?.dataset.contactProductCanonical ?? path, origin);
    if (url.origin !== origin.origin || url.username || url.password || !/^\/(?:products|urun)\/[^/]+\/?$/u.test(url.pathname)) return null;
    url.search = ""; url.hash = "";
    return { productTitle: title, productUrl: url.href };
  } catch { return null; }
}

function environment(pathname: string, hostname: string): Environment {
  const device = window.matchMedia("(max-width: 767px)").matches ? "mobile" : "desktop";
  const blocked = document.body.style.overflow === "hidden" || Boolean(Array.from(document.querySelectorAll('[aria-modal="true"], dialog[open], [data-overlay-open="true"], .mobile-menu[open]')).some(visible));
  let mobileOffset = 0;
  const guzidePurchase = Array.from(document.querySelectorAll("[data-guzide-sticky-purchase]")).some(visible);
  if (device === "mobile") {
    const sioraPurchase = Array.from(document.querySelectorAll('[data-siora-sticky-purchase][data-visible="true"]')).some(visible);
    if (document.querySelector('[data-guzide-mobile-nav="true"]')) mobileOffset = 68;
    if (Array.from(document.querySelectorAll(".siora-mobile-bottom")).some(visible)) mobileOffset = 64;
    if (Array.from(document.querySelectorAll(".lf-bottom-nav")).some(visible)) mobileOffset = Math.max(mobileOffset, 65);
    if (sioraPurchase) mobileOffset = Math.max(mobileOffset, 132);
  }
  // Güzide's purchase bar also appears on small tablets up to 900px.
  if (guzidePurchase) mobileOffset = Math.max(mobileOffset, 82);
  for (const actions of document.querySelectorAll(".purchase-panel.is-mobile-sticky .purchase-actions, [data-lilyum-sticky-purchase]")) {
    if (!visible(actions) || !["sticky", "fixed"].includes(window.getComputedStyle(actions).position)) continue;
    const bounds = actions.getBoundingClientRect();
    const baseBottom = window.innerHeight - mobileOffset - (device === "mobile" ? 16 : 24);
    const baseTop = baseBottom - (device === "mobile" ? 54 : 56);
    if (bounds.top >= 0 && bounds.top < baseBottom && bounds.bottom > baseTop) mobileOffset = Math.max(mobileOffset, Math.ceil(window.innerHeight - bounds.top));
  }
  return { pathname, device, blocked, mobileOffset, product: productContext(pathname, hostname) };
}

function brandInk(color: string) {
  const channels = color.slice(1).match(/.{2}/gu)?.map(channel => {
    const value = parseInt(channel, 16) / 255;
    return value <= .04045 ? value / 12.92 : Math.pow((value + .055) / 1.055, 2.4);
  });
  const luminance = channels ? channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722 : 0;
  return luminance > .179 ? "#17201c" : "#ffffff";
}

export function ContactWidget({ config, storefrontName, hostname, brandColor, logo, fontFamily }: Readonly<{ config: ContactWidgetConfig | null; storefrontName: string; hostname: string; brandColor: string; logo?: PublicDesignMedia; fontFamily?: string }>) {
  const pathname = usePathname() ?? "/", panelId = useId();
  const [state, setState] = useState<Environment | null>(null), [now, setNow] = useState<Date | null>(null), [open, setOpen] = useState(false);
  const [failedLogoUrl, setFailedLogoUrl] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null), triggerRef = useRef<HTMLButtonElement>(null), closeRef = useRef<HTMLButtonElement>(null);
  const previousPath = useRef(pathname);
  const restoreFocus = useRef(false);
  const close = useCallback((returnFocus = true) => { restoreFocus.current = returnFocus; setOpen(false); }, []);

  useEffect(() => {
    if (!config?.enabled) { setState(null); setNow(null); return; }
    const update = () => {
      const next = environment(pathname, hostname);
      setState(previous => previous && previous.pathname === next.pathname && previous.device === next.device && previous.blocked === next.blocked && previous.mobileOffset === next.mobileOffset && previous.product?.productTitle === next.product?.productTitle && previous.product?.productUrl === next.product?.productUrl ? previous : next);
    };
    update(); setNow(new Date());
    const media = window.matchMedia("(max-width: 767px)");
    media.addEventListener("change", update); window.addEventListener("resize", update); window.addEventListener("scroll", update, { passive: true });
    const observer = new window.MutationObserver(update);
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["class", "style", "hidden", "aria-hidden", "aria-modal", "open", "data-overlay-open", "data-visible", "data-storefront-theme", "data-guzide-mobile-nav", "data-contact-product-title", "data-contact-product-path", "data-contact-product-canonical"] });
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => { observer.disconnect(); window.clearInterval(timer); media.removeEventListener("change", update); window.removeEventListener("resize", update); window.removeEventListener("scroll", update); };
  }, [pathname, hostname, config?.enabled]);

  const allowed = Boolean(config && state && state.pathname === pathname && now && !state.blocked && shouldShowContactWidget(config, { pathname, device: state.device, now }));
  const channels = config?.channels.flatMap(channel => {
    if (!channel.enabled) return [];
    const href = resolveContactWidgetHref(channel, config, state?.product ?? undefined);
    return href ? [{ channel, href }] : [];
  }) ?? [];
  const shown = allowed && channels.length > 0;
  useEffect(() => {
    if (previousPath.current !== pathname || !shown) close(false);
    previousPath.current = pathname;
  }, [pathname, shown, close]);

  useEffect(() => {
    if (!open) {
      // The mobile launcher is mounted but hidden while open; focus it after it reappears.
      if (restoreFocus.current) { restoreFocus.current = false; triggerRef.current?.focus(); }
      return;
    }
    if (!shown) return;
    closeRef.current?.focus();
    const keyboard = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); close(); } };
    const outside = (event: PointerEvent) => { if (event.target instanceof window.Node && !rootRef.current?.contains(event.target)) close(false); };
    document.addEventListener("keydown", keyboard); document.addEventListener("pointerdown", outside);
    return () => { document.removeEventListener("keydown", keyboard); document.removeEventListener("pointerdown", outside); };
  }, [open, shown, close]);

  if (!shown || !config || !state || !now) return null;
  const color = /^#[\da-f]{6}$/iu.test(brandColor) ? brandColor : "#193e32";
  const outsideHours = config.hours.enabled && contactWidgetAvailability(config, now) === "outside_hours";
  const style = { "--contact-brand": color, "--contact-brand-ink": brandInk(color), "--contact-mobile-offset": `${state.mobileOffset}px`, "--contact-font": fontFamily } as CSSProperties;
  return <div ref={rootRef} className={styles.widget} style={style} data-contact-widget data-position={config.position} data-theme={config.theme} data-page-type={contactWidgetPageType(pathname)}>
    {open ? <section id={panelId} className={styles.panel} role="dialog" aria-modal="false" aria-label={config.title}>
      <header className={styles.header}>
        <div className={styles.brand} data-contact-brand>{logo?.url && failedLogoUrl !== logo.url ? <img className={styles.logo} src={logo.url} alt={logo.altText || storefrontName} width="144" height="48" onError={() => setFailedLogoUrl(logo.url)} /> : <span>{storefrontName}</span>}</div>
        <button ref={closeRef} className={styles.close} type="button" aria-label="İletişim panelini kapat" onClick={() => close()}><ContactUtilityIcon type="close" /></button>
      </header>
      <div className={styles.content}>
        <h2 className={styles.title}>{config.title}</h2>
        {config.greeting ? <p className={styles.greeting}>{config.greeting}</p> : null}
        {config.hours.enabled ? <div className={styles.hours}><span>{outsideHours ? "Mesai dışı" : "Çalışma saatleri"}</span><p>{outsideHours ? config.hours.outsideMessage : `${config.hours.opensAt} – ${config.hours.closesAt} · ${config.hours.timeZone}`}</p></div> : null}
        <div className={styles.channels}>{channels.map(({ channel, href }) => <a key={channel.type} className={styles.channel} data-contact-channel={channel.type} href={href} target={href.startsWith("https://") ? "_blank" : undefined} rel={href.startsWith("https://") ? "noopener noreferrer" : undefined}>
          <span className={styles.channelIcon} data-channel-icon={channel.type}><ContactChannelIcon type={channel.type} /></span>
          <span className={styles.channelText}><span>{channel.label || channelNames[channel.type]}</span><small>{channelDescriptions[channel.type]}</small></span>
          <span className={styles.arrow}><ContactUtilityIcon type={href.startsWith("https://") ? "external" : "next"} /></span>
        </a>)}</div>
      </div>
    </section> : null}
    <button ref={triggerRef} type="button" className={styles.launcher} hidden={open && state.device === "mobile"} aria-label={config.buttonLabel} aria-haspopup="dialog" aria-expanded={open} aria-controls={panelId} onClick={() => open ? close() : setOpen(true)}><span className={styles.launcherIcon}><ContactLauncherIcon headset={config.icon === "headset"} /></span><span>{config.buttonLabel}</span></button>
  </div>;
}
