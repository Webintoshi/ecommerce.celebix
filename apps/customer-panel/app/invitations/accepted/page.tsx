import Link from 'next/link';
export const dynamic='force-dynamic';
export default function InvitationAccepted(){return <main style={{maxWidth:480,margin:'12vh auto',padding:32,color:'var(--cp-text-primary,#292929)'}}><h1 className="sr-only">Mağaza daveti kabul edildi</h1><p style={{fontSize:24,fontWeight:600}}>Davet kabul edildi</p><p>Mağaza erişiminiz hazır. Doğruladığınız e-posta hesabıyla giriş yapabilirsiniz.</p><Link href="/auth/login" style={{display:'inline-block',marginTop:16,padding:'14px 20px',borderRadius:12,background:'#292929',color:'#fff'}}>Mağazaya giriş yap</Link></main>;}
