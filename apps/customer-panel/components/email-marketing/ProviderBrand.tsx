import type {EmailMarketingProvider} from '@celebix/saas-contracts';
import {serviceName} from '@/lib/email-marketing-ui/state';
import styles from './email-marketing.module.css';

export function ProviderBrand({provider}: Readonly<{provider: EmailMarketingProvider}>) {
  return <span className={styles.brand}>
    {/* Exact official wordmarks; decorative image has an adjacent accessible name. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={`/brands/${provider}.svg`} alt="" width={provider === 'brevo' ? 81 : 81} height={24} />
    <span className={styles.srOnly}>{serviceName(provider)}</span>
  </span>;
}
