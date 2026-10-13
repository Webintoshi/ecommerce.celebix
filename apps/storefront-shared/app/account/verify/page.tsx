import {redirect} from 'next/navigation';
import {safeAccountReturnTo} from '@/lib/account/request.ts';
export const dynamic='force-dynamic';
export default async function VerifyPage({searchParams}:Readonly<{searchParams:Promise<{returnTo?:string;ticket?:string}>}>){
 const returnTo=safeAccountReturnTo((await searchParams).returnTo);
 // Old email tickets never enter a verification flow or appear in the destination.
 redirect(`/account/login?returnTo=${encodeURIComponent(returnTo)}`);
}
