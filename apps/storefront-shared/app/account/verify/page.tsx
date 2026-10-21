import { withCommercePolicyPage } from "@/components/CommercePolicyServerPage";
import {redirect} from 'next/navigation';
import {safeAccountReturnTo} from '@/lib/account/request.ts';
export const dynamic='force-dynamic';
async function VerifyPage({searchParams}:Readonly<{searchParams:Promise<{returnTo?:string;ticket?:string}>}>):Promise<never>{
 const returnTo=safeAccountReturnTo((await searchParams).returnTo);
 // Old email tickets never enter a verification flow or appear in the destination.
 redirect(`/account/login?returnTo=${encodeURIComponent(returnTo)}`);
}

export default withCommercePolicyPage(VerifyPage);
