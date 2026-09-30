import { SeoFixtureScreen } from '../SeoFixtureScreen';
import type { SeoResourceKind } from '@celebix/saas-contracts';
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){const q=await searchParams;return <SeoFixtureScreen view="content" kind={(['category','page','blog'].includes(String(q.kind))?q.kind:'product')as SeoResourceKind} resourceId={typeof q.resourceId==='string'?q.resourceId:undefined} scenario={typeof q.scenario==='string'?q.scenario:'normal'}/>;}
