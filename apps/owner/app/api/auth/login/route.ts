import {readBoundedBody,BodyTooLarge} from '@/lib/platform/body';
import {ownerSameOrigin} from '@/lib/platform/origin';
import {NextResponse} from 'next/server';
import {createOwnerServerClient} from '@/lib/owner-supabase-server';
import {getMissingOwnerSupabaseEnvNames} from '@/lib/owner-supabase-shared';

export async function POST(request:Request) {
 if(!ownerSameOrigin(request))return NextResponse.json({error:'İstek doğrulanamadı.'},{status:403});
 if(getMissingOwnerSupabaseEnvNames().length)return NextResponse.json({error:'Giriş bağlantısı şu anda kullanılamıyor.'},{status:503});
 try {
  const body=JSON.parse(new TextDecoder().decode(await readBoundedBody(request,8192)));
  if(typeof body.email!=='string'||typeof body.password!=='string'||body.email.length>254||body.password.length>1024)return NextResponse.json({error:'E-posta ve şifreyi kontrol edin.'},{status:400});
  const supabase=await createOwnerServerClient();
  const {data,error}=await supabase.auth.signInWithPassword({email:body.email.trim(),password:body.password});
  if(error||!data.session)return NextResponse.json({error:'E-posta veya şifre hatalı.'},{status:401});
  if(!data.user.email_confirmed_at){await supabase.auth.signOut();return NextResponse.json({error:'E-posta doğrulaması gerekli.'},{status:403});}
  return NextResponse.json({success:true,next:'/security'},{headers:{'Cache-Control':'no-store'}});
 }catch(error){if(error instanceof BodyTooLarge)return NextResponse.json({error:'İstek içeriği çok büyük.'},{status:413});return NextResponse.json({error:'Giriş hizmetine ulaşılamadı. Yeniden deneyin.'},{status:503});}
}
