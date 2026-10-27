export type ToshiWallet=Readonly<{balance:number;reserved:number;available:number}>;
export type ToshiCreditOffer=Readonly<{id:string;credits:number;netCents:number}>;
export type ToshiCreditPrices=Readonly<{description:number;seoTitle:number;seoDescription:number;imageAlt:number}>;
export type ToshiCreditOverview=Readonly<{wallet:ToshiWallet;offers:readonly ToshiCreditOffer[];prices:ToshiCreditPrices}>;
export const TOSHI_CREDIT_PRICES:ToshiCreditPrices=Object.freeze({description:7,seoTitle:1,seoDescription:2,imageAlt:1});
export function parseToshiWallet(value:unknown):ToshiWallet {const wallet=value as ToshiWallet;if(!wallet||!['balance','reserved','available'].every(key=>Number.isSafeInteger(wallet[key as keyof ToshiWallet])&&wallet[key as keyof ToshiWallet]>=0))throw new Error('invalid_response');return wallet;}
export async function readToshiCredits(signal?:AbortSignal,fetcher:typeof fetch=fetch):Promise<ToshiCreditOverview>{
 const response=await fetcher('/api/toshi/credits',{credentials:'same-origin',cache:'no-store',signal});if(!response.ok)throw new Error('credits_unavailable');const body=await response.json() as ToshiCreditOverview;const wallet=parseToshiWallet(body.wallet);
 if(!Array.isArray(body.offers)||!body.offers.every(offer=>typeof offer.id==='string'&&Number.isSafeInteger(offer.credits)&&offer.credits>0&&Number.isSafeInteger(offer.netCents)&&offer.netCents>0)||!body.prices||!Object.keys(TOSHI_CREDIT_PRICES).every(key=>Number.isSafeInteger(body.prices[key as keyof ToshiCreditPrices])&&body.prices[key as keyof ToshiCreditPrices]>0))throw new Error('invalid_response');return {...body,wallet};
}
