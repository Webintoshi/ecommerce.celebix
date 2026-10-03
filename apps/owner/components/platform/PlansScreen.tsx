"use client";

import { useState } from "react";
import { publishPlanCommand, featureLabels, limitLabels } from "./actions";
import { CommandDialog } from "./CommandDialog";
import { usePlatformResource } from "./resource";
import type { CommandSpec, Envelope, Plan } from "./types";
import { Badge, Button, count, Empty, money, Panel, ResourceStatus, Screen } from "./ui";

export function PlansScreen() {
  const plans = usePlatformResource<Envelope<Plan>>("/api/platform/plans");
  const [command, setCommand] = useState<CommandSpec | null>(null);
  const items = plans.data?.items || [];
  return <Screen title="Paketler" description="Özellikler ve kullanım sınırlarıyla sürümlenmiş hizmet paketleri." actions={<Button primary disabled={!plans.data || plans.stale} onClick={() => setCommand(publishPlanCommand(items))}>Paket yayınla</Button>}>
    <ResourceStatus resource={plans} />
    <div className="platform-notice"><p>Yayınlanan paketler değiştirilemez. Yeni sürüm yayınlayın, ardından mağazaya açıkça atayın.</p></div>
    {items.length ? <div className="platform-plan-grid">{items.map(plan => <Panel key={plan.id}><div className="platform-plan-heading"><div><h2>{plan.code}</h2><p>Sürüm {plan.version}</p></div><Badge value={plan.status} /></div><div className="platform-feature-list"><div><span>Aylık tarife</span><strong>{money(plan.monthlyPriceCents)}</strong></div><div><span>Yıllık tarife</span><strong>{money(plan.yearlyPriceCents)}</strong></div></div><h3 className="platform-mini-heading">Özellikler</h3><div className="platform-feature-list">{Object.entries(plan.features).map(([key, enabled]) => <div key={key}><span>{featureLabels[key] || key}</span><strong className={enabled ? "is-enabled" : "platform-muted"}>{enabled ? "Açık" : "Kapalı"}</strong></div>)}</div><h3 className="platform-mini-heading">Kullanım sınırları</h3><div className="platform-feature-list">{Object.entries(plan.limits).map(([key, value]) => <div key={key}><span>{limitLabels[key] || key}</span><strong>{count(value)}</strong></div>)}</div><Button disabled={plans.stale} onClick={() => setCommand(publishPlanCommand(items, plan))}>Yeni sürüm yayınla</Button></Panel>)}</div> : plans.data && <Panel><Empty title="Henüz paket yayınlanmamış">Tüm özellik ve limitleri belirleyerek ilk paket sürümünü yayınlayın.</Empty></Panel>}
    <CommandDialog command={command} onClose={() => setCommand(null)} onCommitted={() => void plans.refresh()} onRefresh={async draft => { const result = await plans.refresh(); if (!result) return undefined; return Math.max(0, ...(result.items || []).filter(plan => plan.code === String(draft.code).trim()).map(plan => plan.version)); }} />
  </Screen>;
}
