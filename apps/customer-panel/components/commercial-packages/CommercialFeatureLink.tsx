import Link from 'next/link';
import { LockKeyhole } from 'lucide-react';
import type { CommercialCapability } from '@celebix/saas-contracts';
import { COMMERCIAL_CAPABILITY_LABELS } from '@/lib/commercial-packages/route-model';
import styles from './commercial-packages.module.css';

/** The same positive offer is used wherever an embedded feature is package locked. */
export function CommercialFeatureLink({ capability }: Readonly<{ capability: CommercialCapability }>) {
  return <Link className={styles.featureLink} href={`/upgrade?feature=${capability}`}><LockKeyhole size={14} aria-hidden="true" /><span>{COMMERCIAL_CAPABILITY_LABELS[capability]}: indirimli paketi incele</span></Link>;
}
