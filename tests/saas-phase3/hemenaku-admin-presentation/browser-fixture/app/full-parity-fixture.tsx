"use client";

import { useCallback, useEffect, useState } from "react";

import {
  PanelDataTable,
  PanelMetricCard,
  PanelPageHeader,
  PanelPageShell,
  PanelPanel,
} from "@/components/panel/PanelPageShell";
import { PanelShell } from "@/components/panel/PanelShell";

const MODEL = Object.freeze({
  storeSlug: "browser-kabul-magazasi",
  membershipLabel: "Mağaza sahibi",
  planCode: "growth",
  planVersion: 3,
  entitlementStatus: "active" as const,
  locale: "tr-TR",
});

type RouteDefinition = Readonly<{
  title: string;
  description: string;
  fixture: string;
}>;

const ROUTES: Readonly<Record<string, RouteDefinition>> = Object.freeze({
  "/": Object.freeze({ title: "Mağaza özeti", description: "Kalıcı mağaza kayıtlarından güvenli yönetim özeti.", fixture: "catalog-summary" }),
  "/analytics": Object.freeze({ title: "Analitik", description: "Kalıcı sipariş, müşteri ve katalog kayıtlarının aylık özeti.", fixture: "analytics-dashboard" }),
  "/orders/ORDER_ID/print": Object.freeze({ title: "Sipariş belgesi", description: "Kalıcı sipariş kaydının yazdırılabilir görünümü.", fixture: "order-detail" }),
  "/customers/CUSTOMER_ID/edit": Object.freeze({ title: "Müşteriyi düzenle", description: "İletişim ve kanal izinlerini sürümlü kayda göre düzenleyin.", fixture: "customer-detail" }),
  "/products/extras/RESOURCE_ID/preview": Object.freeze({ title: "Ekstra önizlemesi", description: "Katalog ekstra kaydının güvenli önizlemesi.", fixture: "catalog-extra" }),
  "/products/purchasing": Object.freeze({ title: "Satın alma", description: "Kalıcı satın alma siparişlerini yönetin.", fixture: "purchase-orders" }),
  "/products/inventory-counts": Object.freeze({ title: "Stok sayımları", description: "Depo sayım kayıtlarını ve farklarını inceleyin.", fixture: "inventory-counts" }),
  "/products/transfers": Object.freeze({ title: "Stok transferleri", description: "Depolar arası kalıcı stok hareketlerini yönetin.", fixture: "inventory-transfers" }),
  "/products/price-lists": Object.freeze({ title: "Fiyat listeleri", description: "Sürümlü fiyat listelerini ve kapsamlarını inceleyin.", fixture: "price-lists" }),
  "/seo/products": Object.freeze({ title: "Ürün SEO", description: "Ürün arama görünürlüğü için kalıcı yapılandırma kayıtları.", fixture: "seo-product-entry" }),
  "/products/shopify-converter": Object.freeze({ title: "Shopify dönüştürücü", description: "Yalnız seçilen yerel CSV için güvenli içe aktarma önizlemesi.", fixture: "import-preview" }),
  "/products": Object.freeze({ title: "Ürün kataloğu", description: "Ürünleri, fiyatları ve stok durumlarını yönetin.", fixture: "catalog-products" }),
  "/settings": Object.freeze({ title: "Ayarlar", description: "Mağaza yapılandırmasının kalıcı ve yetkili görünümü.", fixture: "settings" }),
  "/products-evil": Object.freeze({ title: "Geçersiz rota", description: "Yakın eşleşme hiçbir korumalı menüyü etkinleştirmez.", fixture: "negative-route" }),
});

type FixtureDto = Readonly<{
  badge: string;
  metrics: readonly Readonly<{ label: string; value: string; detail: string }>[];
  records: readonly Readonly<{ name: string; state: string; detail: string }>[];
}>;

function routeDefinition(pathname: string): RouteDefinition {
  return ROUTES[pathname] ?? Object.freeze({
    title: "Yerel kabul rotası",
    description: "Bu güvenli yerel rota için desteklenen bir örnek görünüm yok.",
    fixture: "negative-route",
  });
}

export function FullParityFixture({ pathname }: Readonly<{ pathname: string }>) {
  const route = routeDefinition(pathname);
  const [dto, setDto] = useState<FixtureDto>();
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const response = await fetch(`/api/fixture/${route.fixture}`, { credentials: "same-origin", cache: "no-store" });
      if (!response.ok) throw new Error("fixture_unavailable");
      setDto(await response.json() as FixtureDto);
    } catch {
      setDto(undefined);
      setError("Yerel kabul verisi yüklenemedi.");
    }
  }, [route.fixture]);

  useEffect(() => { void load(); }, [load]);

  const normalized = query.trim().toLocaleLowerCase("tr-TR");
  const records = dto?.records.filter((record) => !normalized || `${record.name} ${record.state} ${record.detail}`.toLocaleLowerCase("tr-TR").includes(normalized)) ?? [];

  return (
    <PanelShell model={MODEL}>
      <PanelPageShell>
        <div className="fixture-surface" data-route={pathname} data-loaded={dto ? "true" : "false"}>
          <PanelPageHeader
            title={route.title}
            description={route.description}
            actions={<button data-primary-action type="button" onClick={() => void load()}>Yerel görünümü yenile</button>}
          />
          {error ? <p className="fixture-error" role="alert">{error}</p> : null}
          {!dto ? <p className="fixture-loading" role="status">Kalıcı görünüm hazırlanıyor…</p> : (
            <>
              <div className="fixture-metrics" aria-label="Doğrulanmış özet metrikleri">
                {dto.metrics.map((metric) => <PanelMetricCard key={metric.label} {...metric} />)}
              </div>
              <PanelPanel title={dto.badge}>
                <label className="fixture-filter">Kayıtlarda ara<input aria-label="Kayıtlarda ara" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
                <PanelDataTable label={`${route.title} kayıtları`}>
                  <thead><tr><th scope="col">Kayıt</th><th scope="col">Durum</th><th scope="col">Açıklama</th></tr></thead>
                  <tbody>{records.map((record) => <tr key={`${record.name}:${record.state}`}><td>{record.name}</td><td>{record.state}</td><td>{record.detail}</td></tr>)}</tbody>
                </PanelDataTable>
                {records.length === 0 ? <p className="fixture-empty">Filtreyle eşleşen kalıcı kayıt yok.</p> : null}
              </PanelPanel>
            </>
          )}
        </div>
      </PanelPageShell>
    </PanelShell>
  );
}
