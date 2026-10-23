import Link from 'next/link';
import {ArrowUpRight,Store} from 'lucide-react';
import {MarketplaceArtwork} from '@/components/marketplaces/MarketplaceArtwork';
import styles from '@/components/marketplaces/marketplaces.module.css';
export function TrendyolMarketplaceCard(){return <article className={styles.entry}><MarketplaceArtwork variant="connect" className={styles.entryArtwork}/><div className={styles.entryContent}><div className={styles.entryIdentity}><Store className={styles.entryLogo} aria-hidden="true"/><h2>Trendyol</h2></div><p>Ürün eşleme, kesintilere göre fiyat ve sipariş aktarımı.</p></div><Link href="/marketplaces/trendyol" className="button button-secondary">Bağlantıyı aç<ArrowUpRight size={16} aria-hidden="true"/></Link></article>;}
