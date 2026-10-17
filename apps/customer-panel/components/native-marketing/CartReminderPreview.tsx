"use client";

import { useEffect, useRef, useState } from 'react';
import type { NativeMarketingApi, NativeMarketingPreview } from '@/lib/native-marketing-ui/client';
import { marketingErrorMessage, type MarketingCommand } from '@/lib/native-marketing-ui/model';
import styles from './native-marketing.module.css';

export function CartReminderPreview({ api, canManage, disabled, quotaRemaining, onExecute }: Readonly<{ api: NativeMarketingApi; canManage: boolean; disabled: boolean; quotaRemaining: number; onExecute: (command: MarketingCommand) => void }>) {
  const [preview, setPreview] = useState<NativeMarketingPreview | null>(null), [loading, setLoading] = useState(false), [error, setError] = useState(''), [recipient, setRecipient] = useState('');
  const alive = useRef(true), ticket = useRef(0);
  useEffect(() => { alive.current = true; return () => { alive.current = false; ticket.current++; }; }, []);
  async function showPreview() {
    const selected = ++ticket.current; setLoading(true); setError('');
    try { const value = await api.preview({ templateId: 'cart', productIds: [] }); if (alive.current && selected === ticket.current) setPreview(value); }
    catch (caught) { if (alive.current && selected === ticket.current) setError(marketingErrorMessage(caught)); }
    finally { if (alive.current && selected === ticket.current) setLoading(false); }
  }
  function test() {
    const address = recipient.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) { setError('Test için geçerli bir e-posta adresi girin.'); return; }
    setError(''); onExecute({ kind: 'test', operationId: crypto.randomUUID(), body: { name: 'Sepet hatırlatması testi', templateId: 'cart', productIds: [], recipient: address } });
  }
  return <div className={styles.cartPreview}>
    <button type="button" className="button button-secondary" disabled={loading || disabled} onClick={() => void showPreview()}>{loading ? 'Hazırlanıyor…' : 'Şablonu önizle'}</button>
    {error ? <p role="alert" className={styles.notice}>{error}</p> : null}
    {preview ? <div className={styles.previewPanel}><div className={styles.previewHeading}><strong>{preview.subject}</strong><small>Gönderen: {preview.from}</small></div><iframe title="Sepet hatırlatması önizlemesi" sandbox="" referrerPolicy="no-referrer" srcDoc={preview.html} />{canManage ? <div className={styles.testSend}><label className={styles.field}>Test e-postası<input type="email" aria-label="Sepet şablonu test e-postası" value={recipient} maxLength={254} disabled={disabled} onChange={event => setRecipient(event.target.value)} /></label><button type="button" className="button button-secondary" disabled={disabled || !recipient.trim() || quotaRemaining < 1} onClick={test}>Şablonu test et</button><p className={styles.note}>Test yalnızca yazdığınız adrese gönderilir. Otomatik hatırlatmayı etkinleştirmez.</p></div> : null}</div> : null}
  </div>;
}
