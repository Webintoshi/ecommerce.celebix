import type {LuckyWheelManagedPromotionIndex} from '@celebix/saas-contracts';
export type LuckyWheelManagedPromotion=LuckyWheelManagedPromotionIndex['items'][number];
export async function readLuckyWheelManagedPromotions(api:{managedPromotions(input:{limit:number;cursor:string|null}):Promise<LuckyWheelManagedPromotionIndex>}):Promise<ReadonlyMap<string,LuckyWheelManagedPromotion>>{
 const rows=new Map<string,LuckyWheelManagedPromotion>(),cursors=new Set<string>();let cursor:string|null=null;
 for(let page=0;page<50;page++){const result=await api.managedPromotions({limit:200,cursor});for(const item of result.items){if(rows.has(item.promotionId))throw new Error('managed_index_invalid');rows.set(item.promotionId,item)}if(!result.hasMore)return rows;if(!result.nextCursor||cursors.has(result.nextCursor))throw new Error('managed_index_invalid');cursor=result.nextCursor;cursors.add(cursor)}
 throw new Error('managed_index_limit');
}
