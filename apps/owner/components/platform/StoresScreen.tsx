"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { usePlatformResource } from "./resource";
import type { Envelope, Store } from "./types";
import { Badge, count, Empty, Panel, ResourceStatus, Screen, Table } from "./ui";

export function StoresScreen() {
  const stores = usePlatformResource<Envelope<Store>>("/api/platform/stores");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const items = useMemo(() => stores.data?.items?.filter(store => (!status || store.status === status) && `${store.name} ${store.slug}`.toLocaleLowerCase("tr").includes(query.toLocaleLowerCase("tr"))) || [], [stores.data, query, status]);
  return <Screen title="Mağazalar" description="Platforma bağlı gerçek mağazalar, sahiplik ve hizmet durumları." actions={<Link href="/stores/new" className="platform-button is-primary">Yeni mağaza</Link>}>
    <ResourceStatus resource={stores} />
    <Panel><div className="platform-filters"><label className="platform-field"><span>Mağaza ara</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Mağaza adı veya kısa adı" /></label><label className="platform-field"><span>Durum</span><select value={status} onChange={event => setStatus(event.target.value)}><option value="">Tüm durumlar</option><option value="active">Aktif</option><option value="provisioning">Hazırlanıyor</option><option value="suspended">Askıya alınmış</option></select></label></div>
      {items.length ? <Table headings={["Mağaza", "Durum", "Paket", "Ürün / personel", "Satış kabulü", ""]}>{items.map(store => <tr key={store.id}><td><Link className="platform-strong-link" href={`/stores/${encodeURIComponent(store.id)}`}>{store.name}</Link><small className="platform-cell-note">{store.slug}</small></td><td><Badge value={store.status} /></td><td>{store.subscription ? `${store.subscription.planCode} · v${store.subscription.planVersion}` : <span className="platform-muted">Paket atanmamış</span>}</td><td>{count(store.usage?.products)} / {count(store.usage?.staff)}</td><td>{store.salesPolicy ? <Badge value={store.salesPolicy.paused ? "paused" : "active"} /> : "Bilinmiyor"}</td><td><Link className="platform-text-link" href={`/stores/${encodeURIComponent(store.id)}`}>Detay →</Link></td></tr>)}</Table> : stores.data && <Empty title={query || status ? "Filtreyle eşleşen mağaza yok" : "Henüz mağaza yok"}>{query || status ? "Aramayı veya durum filtresini değiştirin." : "Doğrulanmış kayıt akışı tamamlanan mağazalar burada görünür."}</Empty>}
    </Panel>
  </Screen>;
}

export function NewStoreScreen() {
  return <Screen title="Yeni mağaza" description="Yeni mağaza, ortak kayıt ve kimlik doğrulama akışıyla açılır." actions={<Link className="platform-button" href="/stores">Mağazalara dön</Link>}>
    <Panel title="Doğrulanmış mağaza kurulumu"><div className="platform-onboarding-copy"><p>Mağaza sahibi kendi hesabını doğrular, mağaza bilgilerini tamamlar ve ortak kurulum akışını başlatır. Oluşan mağaza bu panelde otomatik görünür.</p><ol><li>Mağaza sahibinin doğrulanmış hesabıyla kayıt akışını açın.</li><li>Mağaza adı ve adresini tamamlayıp kurulumu başlatın.</li><li>Kurulumdan sonra paketi ve gerçek hizmet bedelini mağaza detayından kaydedin.</li></ol><Link href="/magaza-ac" className="platform-button is-primary">Mağaza kayıt akışını aç</Link></div></Panel>
  </Screen>;
}
