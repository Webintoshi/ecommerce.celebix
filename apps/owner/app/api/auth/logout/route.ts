import {cookies} from 'next/headers';
import {NextResponse} from 'next/server';
import {createOwnerServerClient} from '@/lib/owner-supabase-server';
import {expireOwnerAuthCookies} from '@/lib/owner-auth-cookies';
import {ownerSameOrigin} from '@/lib/platform/origin';
export async function POST(request:Request){
 if(!ownerSameOrigin(request))return NextResponse.json({error:'İstek doğrulanamadı.'},{status:403});
 try{const existing=(await cookies()).getAll();const client=await createOwnerServerClient();const {error}=await client.auth.signOut({scope:'local'});if(error)throw error;const response=NextResponse.json({success:true},{headers:{'Cache-Control':'no-store'}});expireOwnerAuthCookies(response,existing);return response;}
 catch{return NextResponse.json({error:'Çıkış tamamlanamadı. Yeniden deneyin.'},{status:503});}
}
