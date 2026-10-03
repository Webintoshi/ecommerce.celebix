import {readBoundedBody,BodyTooLarge} from '@/lib/platform/body';
import {ownerSameOrigin} from '@/lib/platform/origin';
import {NextResponse} from 'next/server';
import {createOwnerServerClient} from '@/lib/owner-supabase-server';
import {resolvePlatformIdentity} from '@/lib/platform/auth';
const headers={'Cache-Control':'no-store'};
async function allowed(){const d=await resolvePlatformIdentity();return d.kind==='authorized'||d.kind==='mfa_required';}
async function state(){const client=await createOwnerServerClient();const {data,error}=await client.auth.mfa.listFactors();if(error)throw error;const factor=data.totp.find(f=>f.status==='verified');const decision=await resolvePlatformIdentity();const {data:claimData,error:claimError}=await client.auth.getClaims();if(claimError)throw claimError;const claims=claimData?.claims;return {factorId:factor?.id??null,qr:null,enrolled:!!factor,authorized:decision.kind==='authorized',assuranceLevel:claims?.aal,passwordAuthenticated:Array.isArray(claims?.amr)&&claims.amr.some((method:{method?:string})=>method.method==='password')};}
export async function GET(){if(!await allowed())return NextResponse.json({error:'Doğrulanmış sahip girişi gerekli.'},{status:403,headers});try{return NextResponse.json({state:await state()},{headers});}catch(error){if(error instanceof BodyTooLarge)return NextResponse.json({error:'İstek içeriği çok büyük.'},{status:413});return NextResponse.json({error:'Güvenlik bilgisi alınamadı.'},{status:503,headers});}}
export async function POST(request:Request){
 if(!ownerSameOrigin(request)||!await allowed())return NextResponse.json({error:'Doğrulanmış sahip girişi gerekli.'},{status:403,headers});
 try{const b=JSON.parse(new TextDecoder().decode(await readBoundedBody(request,4096)));const client=await createOwnerServerClient();
  if(b.action==='enroll'){
   const existing=await state();if(existing.enrolled)return NextResponse.json({state:existing},{headers});
   const {data:factors,error:factorError}=await client.auth.mfa.listFactors();if(factorError)throw factorError;
   for(const factor of factors.all.filter(f=>f.factor_type==='totp'&&f.status==='unverified')){const {error}=await client.auth.mfa.unenroll({factorId:factor.id});if(error)throw error;}
   const {data,error}=await client.auth.mfa.enroll({factorType:'totp',friendlyName:'Celebix sahip doğrulaması',issuer:'Celebix'});if(error)throw error;
   return NextResponse.json({state:{...await state(),factorId:data.id,qr:data.totp.qr_code,enrolled:false,authorized:false}},{headers});
  }
  if(b.action==='verify'){
   if(typeof b.factorId!=='string'||typeof b.code!=='string'||!/^\d{6}$/.test(b.code))return NextResponse.json({error:'6 haneli kodu kontrol edin.'},{status:400,headers});
   const {error}=await client.auth.mfa.challengeAndVerify({factorId:b.factorId,code:b.code});if(error)return NextResponse.json({error:'Kod doğrulanamadı. Uygulamadaki güncel kodu deneyin.'},{status:400,headers});
   const current=await state();return NextResponse.json({state:current,authorized:current.authorized},{headers});
  }
  if(b.action==='password'){
   if(typeof b.password!=='string'||b.password.length<12||b.password.length>1024)return NextResponse.json({error:'Şifre en az 12 karakter olmalı.'},{status:400,headers});
   const existing=await state();if(existing.enrolled&&existing.assuranceLevel!=='aal2')return NextResponse.json({error:'Önce doğrulama koduyla giriş yapın.'},{status:403,headers});
   const {data:userData,error:userError}=await client.auth.getUser();if(userError||!userData.user?.email)throw userError||new Error('user_unavailable');
   const {error}=await client.auth.updateUser({password:b.password});if(error)throw error;
   const {error:loginError}=await client.auth.signInWithPassword({email:userData.user.email,password:b.password});if(loginError)throw loginError;
   return NextResponse.json({success:true,state:await state()},{headers});
  }
  return NextResponse.json({error:'İşlem tanınmıyor.'},{status:400,headers});
 }catch(error){if(error instanceof BodyTooLarge)return NextResponse.json({error:'İstek içeriği çok büyük.'},{status:413});return NextResponse.json({error:'Güvenlik işlemi tamamlanamadı. Yeniden deneyin.'},{status:503,headers});}
}
