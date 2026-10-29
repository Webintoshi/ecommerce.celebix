"use client";
import { useState } from "react";
import { GoogleMerchantMarketplaceCard } from "@/components/google-merchant/GoogleMerchantMarketplaceCard";
import { TrendyolMarketplaceCard } from "@/components/trendyol/TrendyolMarketplaceCard";
import { TrendyolConsole } from "@/components/trendyol/TrendyolConsole";
import { GoogleMerchantConsole } from "@/components/google-merchant/GoogleMerchantConsole";
import { MarketplaceConnectionForm } from "@/components/marketplaces/MarketplaceConnectionForm";
import { MerchantModuleConsole } from "@/components/merchant-admin/MerchantModuleConsole";
import type { TrendyolClient } from "@/lib/trendyol-ui/client";
import type { GoogleMerchantClient } from "@/components/google-merchant/client";

const pricing={commissionBps:1700,commissionVatIncluded:true,commissionVatBps:2000,averageShippingCents:9000,otherFeeCents:0,productVatBps:2000,withholdingBps:100,coverWithholding:false,rounding:"cent" as const};
const products=[{productId:"f6d8029d-5456-4e82-85cf-e877d9bdaaa4",variantId:"947b39e9-f3f1-4a96-a101-4b4c46c1c383",title:"Pamuklu oversize gömlek · Ekru / M",sku:"SIO-GOM-M",barcode:"8691234567890",webPriceCents:129900,quantity:24,mapping:null,status:"submitted",issue:null,updatedAt:"2026-10-29T09:00:00Z",tax:{treatment:"taxable",rateBps:2000}},{productId:"cb86029d-5456-4e82-85cf-e877d9bdaaa4",variantId:"cb7b39e9-f3f1-4a96-a101-4b4c46c1c383",title:"Dökümlü keten pantolon · Siyah / 38",sku:"SIO-PAN-38",barcode:null,webPriceCents:159900,quantity:12,mapping:null,status:"not_configured",issue:"mapping_required",updatedAt:"2026-10-29T09:00:00Z",tax:{treatment:"taxable",rateBps:2000}}];
export function MarketplacePolishFixture({view}:{view:string}) {
 const [dirty,setDirty]=useState(false);
 const trendyol={overview:async()=>({connection:{connected:view!=="trendyol-setup",sellerId:view!=="trendyol-setup"?"123456":null,status:view!=="trendyol-setup"?"connected":"disconnected",version:2,settingsVersion:7,lastOrdersAt:"2026-10-29T09:00:00Z",lastErrorCode:null},pricing,counts:{mapped:24,pending:3,failed:1},webhookUrl:null}),productsTax:async()=>({items:products,nextCursor:null}),orderIssues:async()=>({items:[]}),options:async()=>({items:[]})} as unknown as TrendyolClient;
 const google={overview:async()=>({storeDomain:"store.browser.test",connection:{service:"merchant",version:1,status:"connected",googleEmail:"owner@example.test",selection:{accountId:"123",resourceId:"456",resourceName:"Mağaza"},lastCheckedAt:null,errorCode:null},dataSourceId:"456",lastSyncedAt:"2026-10-29T09:00:00Z",counts:{ready:4,pending:3,submitted:12,approved:24,limited:1,disapproved:1,excluded:2,failed:0},identityProfile:{ownBrand:false,brandName:"",version:1}}),products:async()=>({items:products.map((p,i)=>({...p,priceCents:p.webPriceCents,productUrl:"https://store.browser.test/products/shirt",status:i?"disapproved":"approved",issues:i?[{code:"gtin_missing",message:"Üretici barkodu eksik."}]:[],lastSubmittedAt:null,enabled:true,attributes:{}})),nextCursor:null})} as unknown as GoogleMerchantClient;
 return <>{view.startsWith("trendyol")?<TrendyolConsole canManage client={trendyol}/>:view==="google"?<GoogleMerchantConsole canManage client={google}/>:view==="new"?<MarketplaceConnectionForm returnTo="/marketplace-polish/list" busy={false} dirty={dirty} onDirtyChange={()=>setDirty(true)} onSubmit={event=>event.preventDefault()}/>:<><GoogleMerchantMarketplaceCard/><TrendyolMarketplaceCard/><MerchantModuleConsole kind="marketplace_connection" canManage embedded/></>}</>;
}
