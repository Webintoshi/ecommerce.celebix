import Link from 'next/link';
import {ArrowUpRight,Store} from 'lucide-react';

import styles from '@/components/marketplaces/marketplaces.module.css';
export function TrendyolMarketplaceCard(){return <article className={styles.entry}><div className={styles.entryContent}><div className={styles.entryIdentity}><Store className={styles.entryLogo} aria-hidden="true"/><h2>Trendyol</h2></div><p>Ürün eşleme, kesintilere göre fiyat ve sipariş aktarımı.</p></div><Link href="/marketplaces/trendyol" className="button button-secondary" aria-label="Trendyol bağlantısını aç">Aç<ArrowUpRight size={16} aria-hidden="true"/></Link></article>;}
