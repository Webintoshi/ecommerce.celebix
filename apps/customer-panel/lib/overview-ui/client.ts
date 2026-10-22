import {ANALYTICS_PERIODS,parseAnalyticsDashboard,type AnalyticsDashboard,type AnalyticsPeriod} from '@celebix/saas-contracts';
import {AnalyticsApiError} from '../analytics-ui/client.ts';

type Fetcher=(input:RequestInfo|URL,init?:RequestInit)=>Promise<Response>;
const CODES=['invalid_input','unauthenticated','membership_denied','store_inactive','feature_not_enabled','durable_authority_invalid','unavailable'] as const;
export function createOverviewApi(fetcher:Fetcher=fetch){
 return Object.freeze({async dashboard(period:AnalyticsPeriod):Promise<Readonly<AnalyticsDashboard>>{
  if(!ANALYTICS_PERIODS.includes(period))throw new TypeError('overview_client_invalid');
  try{
   const response=await fetcher(`/api/overview/dashboard?period=${encodeURIComponent(period)}`,{credentials:'same-origin',cache:'no-store'});
   if(response.headers.get('content-type')?.split(';',1)[0]!=='application/json')throw new AnalyticsApiError('unavailable',503);
   const value:unknown=await response.json();
   if(!response.ok){
    const code=typeof value==='object'&&value!==null&&!Array.isArray(value)&&Object.keys(value).length===1?(value as {code?:unknown}).code:undefined;
    throw new AnalyticsApiError(CODES.includes(code as typeof CODES[number])?code as typeof CODES[number]:'unavailable',response.status);
   }
   const result=parseAnalyticsDashboard(value);
   if(result.period!==period)throw new AnalyticsApiError('unavailable',503);
   return result;
  }catch(error){if(error instanceof AnalyticsApiError)throw error;throw new AnalyticsApiError('unavailable',503);}
 }});
}
export const overviewApi=createOverviewApi();
