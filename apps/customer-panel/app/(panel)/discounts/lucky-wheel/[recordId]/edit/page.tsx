import {renderLuckyWheelPage} from '@/lib/server-lucky-wheel/page';
export default async function EditLuckyWheelPage({params}:{params:Promise<{recordId:string}>}){return renderLuckyWheelPage({campaignId:(await params).recordId})}
