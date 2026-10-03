"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { adjustPeriodCommand, assignPlanCommand, periodCommand, receiptCommand } from "./actions";
import { CommandDialog } from "./CommandDialog";
import { usePlatformResource } from "./resource";
import type { CommandSpec, Envelope, Period, Plan, Store, Subscription } from "./types";
import { Badge, Button, dateOnly, Empty, money, Panel, ResourceStatus, Screen, Table } from "./ui";

export function FinanceScreen() {
  const billing = usePlatformResource<Envelope<Period>>("/api/platform/billing");
  const stores = usePlatformResource<Envelope<Store>>("/api/platform/stores");
  const plans = usePlatformResource<Envelope<Plan>>("/api/platform/plans");
  const subscriptions = usePlatformResource<Envelope<Subscription>>("/api/platform/subscriptions");
  const [storeId, setStoreId] = useState("");
  const [command, setCommand] = useState<CommandSpec | null>(null);
  const storeMap = useMemo(() => new Map(stores.data?.items?.map(store => [store.id, store])), [stores.data]);
  const selected = storeMap.get(storeId);
  const periods = billing.data?.items?.filter(period => !storeId || period.storeId === storeId) || [];
  const subscriptionsList = subscriptions.data?.items?.filter(subscription => !storeId || subscription.storeId === storeId) || [];
  const writable = Boolean(selected && !stores.stale && !billing.stale);
  const refresh = () => { void billing.refresh(); void stores.refresh(); void subscriptions.refresh(); };
  return <Screen title="Abonelik ve Finans" description="Mağaza başına hizmet aboneliği, dönem borcu ve gerçek platform tahsilatları.">
    <div className="platform-notice"><p>Platform hizmet tutarlarını elle kaydedin. Borç dönemi olmayan mağazalarda finansal kurulum gerekir. Vade geçişi teknik aboneliği değiştirmez.</p></div>
    <ResourceStatus resource={stores} />
    <div className="platform-toolbar"><label className="platform-field"><span>Mağaza</span><select value={storeId} onChange={event => setStoreId(event.target.value)}><option value="">Tüm mağazalar</option>{stores.data?.items?.map(store => <option key={store.id} value={store.id}>{store.name}</option>)}</select></label><div className="platform-actions"><Button disabled={!writable} primary onClick={() => selected && setCommand(periodCommand(selected))}>Borç dönemi oluştur</Button><Button disabled={!selected || !plans.data || plans.stale || stores.stale} onClick={() => selected && setCommand(assignPlanCommand(selected, plans.data?.items || []))}>Paket ata</Button></div></div>
    <Panel title="Borç ve tahsilat dönemleri"><ResourceStatus resource={billing} />{periods.length ? <Table headings={["Mağaza / dönem", "Tarih aralığı", "Vade", "Borç", "Tahsilat", "Kalan", ""]}>{periods.map(period => { const store = storeMap.get(period.storeId); return <tr key={period.id}><td><strong>{store?.name || period.storeId}</strong><small className="platform-cell-note">{period.label}</small></td><td>{dateOnly(period.startsOn)}<small className="platform-cell-note">{dateOnly(period.endsOn)}</small></td><td>{dateOnly(period.dueOn)}</td><td>{money(period.amountCents)}{period.originalAmountCents !== undefined && period.originalAmountCents !== period.amountCents && <small className="platform-cell-note">İlk ücret: {money(period.originalAmountCents)}</small>}</td><td>{money(period.collectedCents)}</td><td><strong>{money(period.remainingCents)}</strong></td><td><div className="platform-actions"><Button disabled={!store || stores.stale || billing.stale || period.remainingCents <= 0} onClick={() => store && setCommand(receiptCommand(store, period))}>Tahsilat kaydet</Button><Button disabled={!store || stores.stale || billing.stale} onClick={() => store && setCommand(adjustPeriodCommand(store, period))}>Borcu düzelt</Button></div></td></tr>; })}</Table> : billing.data && <Empty title="Finansal kurulum gerekli">{selected ? `${selected.name} için gerçek hizmet bedeliyle ilk borç dönemini oluşturun.` : "Mağaza seçerek ilk borç dönemini oluşturun."}</Empty>}<p className="platform-panel-note">Tahsilat geçmişi ve gerekçeli ters kayıtlar mağaza detayındaki Finans sekmesindedir.</p></Panel>
    <Panel title="Teknik abonelikler"><ResourceStatus resource={subscriptions} />{subscriptionsList.length ? <Table headings={["Mağaza", "Paket", "Durum", "Geçerlilik", ""]}>{subscriptionsList.map(subscription => <tr key={subscription.id}><td>{storeMap.get(subscription.storeId || "")?.name || subscription.storeId}</td><td>{subscription.planCode} · v{subscription.planVersion}</td><td><Badge value={subscription.status} /></td><td>{dateOnly(subscription.validFrom)}<small className="platform-cell-note">{subscription.validUntil ? dateOnly(subscription.validUntil) : "Bitiş tarihi yok"}</small></td><td><Link href={`/stores/${encodeURIComponent(subscription.storeId || "")}`} className="platform-text-link">Mağaza detayı →</Link></td></tr>)}</Table> : subscriptions.data && <Empty title="Aktif abonelik kaydı yok">Paket ataması mağaza bazında yapılır.</Empty>}</Panel>
    {plans.error && <div className="platform-notice is-error" role="status"><p>Paketler yüklenemedi. Paket atamak için tekrar yükleyin.</p><Button onClick={() => void plans.refresh()}>Paketleri yenile</Button></div>}
    <CommandDialog command={command} onClose={() => setCommand(null)} onCommitted={refresh} onRefresh={async draft => { if (command?.action === "billing.period.adjust") { const fresh = await billing.refresh(); const periodId = command.initial.periodId; return fresh?.items?.find(period => period.id === periodId)?.version; } const result = await stores.refresh(); return result?.items?.find(store => store.id === command?.resourceId)?.version; }} />
  </Screen>;
}
