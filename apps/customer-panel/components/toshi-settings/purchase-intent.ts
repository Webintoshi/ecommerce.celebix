export function hasToshiTestPurchaseIntent(query:Readonly<Record<string,string|string[]|undefined>>):boolean {
 return Object.keys(query).length===1&&query.purchase==='toshi-test-1';
}
