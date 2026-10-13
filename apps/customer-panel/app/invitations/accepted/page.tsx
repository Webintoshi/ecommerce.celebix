import Link from 'next/link';
export const dynamic='force-dynamic';
export default function RetiredInvitationPage(){return <main style={{maxWidth:480,margin:'12vh auto',padding:32,color:'var(--cp-text-primary,#292929)'}}><h1>Davet bağlantıları kaldırıldı</h1><p>Telefon numaranızla giriş yapın. Çalışan erişimi için mağaza sahibine başvurun.</p><Link href="/login">Girişe dön</Link></main>;}
