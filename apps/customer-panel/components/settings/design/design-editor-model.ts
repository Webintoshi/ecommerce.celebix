import {normalizeStarterThemeCompositionV3, type StorefrontDesignDocument} from "@celebix/saas-contracts";

export function synchronizeCompositionAnnouncement(design:StorefrontDesignDocument,composition:StorefrontDesignDocument["composition"]):StorefrontDesignDocument {
 if(design.composition.announcement.enabled===composition.announcement.enabled && JSON.stringify(design.composition.announcement.items)===JSON.stringify(composition.announcement.items)) return {...design,composition};
 return {...design,composition,announcement:{...design.announcement,enabled:composition.announcement.enabled,items:composition.announcement.items.every(item => item.length <= 120) ? composition.announcement.items : design.announcement.items}};
}
export function updateDesignAnnouncement(design:StorefrontDesignDocument,patch:Partial<StorefrontDesignDocument["announcement"]>):StorefrontDesignDocument {
 const content={...design.composition.announcement,...("enabled" in patch?{enabled:patch.enabled}:{}),...("items" in patch?{items:patch.items}:{})};
 return {...design,announcement:{...design.announcement,...patch,enabled:content.enabled,items:content.items.every(item => item.length <= 120) ? content.items : design.announcement.items},composition:{...design.composition,announcement:content}};
}

export function toStoreLocalTime(value:string|null,timezone:string):string {
 if(!value) return "";
 const instant=new Date(value);if(!Number.isFinite(instant.valueOf()))return "";
 const parts=new Intl.DateTimeFormat("en-CA",{timeZone:timezone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(instant);
 const part=(kind:string)=>parts.find(item=>item.type===kind)?.value??"";
 return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}
export function fromStoreLocalTime(value:string,timezone:string):string|null {
 if(!value)return null;
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))return null;
 const wall=Date.parse(`${value}:00Z`);if(!Number.isFinite(wall))return null;
 let instant=wall;
 for(let attempt=0;attempt<4;attempt++){
  const local=toStoreLocalTime(new Date(instant).toISOString(),timezone);
  const difference=wall-Date.parse(`${local}:00Z`);
  if(difference===0)return new Date(instant).toISOString();
  instant+=difference;
 }
 // A skipped daylight-saving hour has no corresponding instant.
 return null;
}

export function effectiveHeroEnabled(design:StorefrontDesignDocument):boolean {
 return design.hero.enabled || design.composition.sections.some(section=>section.kind==="hero"&&section.enabled);
}
export function updateHeroVisibility(design:StorefrontDesignDocument,enabled:boolean):StorefrontDesignDocument {
 const composition=normalizeStarterThemeCompositionV3(design.composition);
 return {...design,schemaVersion:4,hero:{...design.hero,enabled},composition:{...composition,sections:composition.sections.map(section=>section.kind==="hero"?{...section,enabled:false}:section)}};
}
