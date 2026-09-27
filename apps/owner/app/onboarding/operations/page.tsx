import {requireOwnerAuth,requireSuperAdmin} from '../../../lib/owner-auth.ts';
import {resolveDefaultOnboardingOperations} from '../../../lib/onboarding-operations/default.ts';
import {OnboardingOperations} from '../../../components/self-serve/OnboardingOperations.tsx';
export const dynamic='force-dynamic';
export default async function OnboardingOperationsPage(){
 requireSuperAdmin(await requireOwnerAuth('/onboarding/operations'));
 const service=await resolveDefaultOnboardingOperations();const result=await service?.list({superAdmin:true},new Date());
 return <><div className="page-header"><div><h1>Mağaza kurulumları</h1><p>Bekleyen kurulumları ve erişim kontrollerini takip edin.</p></div></div>
 {result?.kind==='ok'?<OnboardingOperations data={result.data}/>:<div className="card" role="status">Kurulum durumları şu anda okunamıyor. Biraz sonra sayfayı yenileyin.</div>}</>;
}
