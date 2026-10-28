import Link from 'next/link';
import { ArrowRight, Check, LockKeyhole } from 'lucide-react';
import { getRequiredCommercialPackage, type CommercialCapability, type CommercialPackage } from '@celebix/saas-contracts';
import { COMMERCIAL_CAPABILITY_LABELS } from '@/lib/commercial-packages/route-model';
import { hasAnnualDiscount, packageGrossCents, packageMoney } from './presentation';
import styles from './commercial-packages.module.css';
function UpgradeArtwork() { return <svg className={styles.artwork} viewBox="0 0 240 180" aria-hidden="true" focusable="false"><ellipse cx="120" cy="153" rx="100" ry="13" fill="var(--cp-art-soft)"/><rect x="44" y="49" width="142" height="105" rx="12" fill="var(--cp-surface)" stroke="var(--cp-art-outline)" strokeWidth="3"/><path d="M44 77h142" stroke="var(--cp-art-outline)" strokeWidth="3"/><circle cx="59" cy="63" r="3" fill="var(--cp-brand)"/><circle cx="71" cy="63" r="3" fill="var(--cp-art-muted)"/><path d="M67 132v-20m24 20v-34m24 34v-47" stroke="var(--cp-art-outline)" strokeWidth="9" strokeLinecap="round"/><rect x="137" y="27" width="60" height="62" rx="12" fill="var(--cp-art-peach)" stroke="var(--cp-art-outline)" strokeWidth="3"/><path d="m152 62 11-11 12 11m-12-11v24" fill="none" stroke="var(--cp-brand)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/><path d="m28 87-4 6m0-6 4 6m179 33 5 5m0-5-5 5" stroke="var(--cp-art-outline)" strokeWidth="2" strokeLinecap="round"/></svg>; }
export function CommercialRoleContact() { return <section className={styles.roleContact} role="status"><LockKeyhole size={24} aria-hidden="true"/><h2>Mağaza sahibinizle görüşün</h2><p>Bu alanın kullanımı için mağaza sahibinizden yetkilerinizi kontrol etmesini isteyin.</p><Link className="button button-secondary" href="/">Genel bakışa dön</Link></section>; }
export function CommercialUpgradeCard({ capability, currentPackage, currentPlanName, canRequest }: Readonly<{
    capability: CommercialCapability;
    currentPackage?: CommercialPackage;
    currentPlanName?: string;
    canRequest: boolean;
}>) {
    const recommended = getRequiredCommercialPackage(capability), discount = hasAnnualDiscount(recommended), href = `/settings/plan?feature=${capability}`;
    return <section className={styles.upgradeCard} aria-labelledby="commercial-upgrade-title">
  <div className={styles.upgradeIntro}><UpgradeArtwork /><span className={styles.eyebrow}>{COMMERCIAL_CAPABILITY_LABELS[capability]}</span><h2 id="commercial-upgrade-title">{discount ? 'Bu özelliğe indirimli sahip olabilirsiniz' : 'Bu özellikle mağazanızı büyütün'}</h2>{discount ? <p>Yıllık pakette 12 ay kullanın, 10 ay ödeyin.</p> : null}</div>
  <div className={styles.packagePair}><div className={styles.currentPackage}><span>Mevcut paketiniz</span><strong>{currentPackage?.name ?? currentPlanName ?? 'Mevcut paket'}</strong><small>Mağazanızın etkin paketi</small></div><div className={styles.recommendedPackage}><span>Önerilen paket</span><strong>{recommended.name}</strong><p className={styles.annualPrice}>{packageMoney(packageGrossCents(recommended.annualPriceCents))} <small>TL / yıl · KDV dahil</small></p><small>Yıllık peşin ödeme</small><p className={styles.monthlyPrice}>Aylık ödeme: {packageMoney(packageGrossCents(recommended.monthlyPriceCents))} TL · KDV dahil</p><div className={styles.included}><Check size={16} aria-hidden="true"/>{COMMERCIAL_CAPABILITY_LABELS[capability]}</div></div></div>
  <div className={styles.cardActions}>{canRequest ? <Link className="button button-primary" href={href}>{discount ? 'İndirimli paketi incele' : 'Önerilen paketi incele'}<ArrowRight size={16} aria-hidden="true"/></Link> : <p>Mağaza sahibinizle paket seçeneklerini inceleyebilirsiniz.</p>}<Link className={styles.compareLink} href={href}>Paketleri karşılaştır <ArrowRight size={16} aria-hidden="true"/></Link></div>
 </section>;
}
