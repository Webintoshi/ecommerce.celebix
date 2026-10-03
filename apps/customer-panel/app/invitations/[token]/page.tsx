import Link from 'next/link';
export const dynamic='force-dynamic';
export default async function InvitationPage({params}:{params:Promise<{token:string}>}){
 const {token}=await params;const valid=/^[a-f0-9-]{72}$/.test(token);
 return <main style={{maxWidth:480,margin:'12vh auto',padding:32,color:'var(--cp-text-primary,#292929)'}}><h1 className="sr-only">Mağaza daveti</h1><p style={{fontSize:24,fontWeight:600}}>Mağaza yönetimine katıl</p><p>{valid?'Davet edilen e-posta hesabınızı doğrulayarak mağazanın yönetimine katılabilirsiniz.':'Bu davet bağlantısı geçersiz. Mağaza yöneticisinden yeni bir davet isteyin.'}</p>{valid?<form method="post" action="/api/platform-invitations/start"><input type="hidden" name="token" value={token}/><button type="submit" style={{marginTop:16,padding:'14px 20px',borderRadius:12,background:'#292929',color:'#fff',border:0,font: 'inherit'}}>E-postamı doğrula ve katıl</button></form>:<Link href="/login">Girişe dön</Link>}</main>;
}
