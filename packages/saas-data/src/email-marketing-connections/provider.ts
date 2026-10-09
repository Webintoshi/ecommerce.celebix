import type {EmailMarketingListPage,EmailMarketingProviderResult,EmailMarketingConnectionAdapter} from './types.ts';
export type {EmailMarketingListPage,EmailMarketingProviderResult};
export interface EmailMarketingProfile {readonly email:string;readonly firstName?:string;readonly lastName?:string}
export interface EmailMarketingEvidence {readonly consentedAt:string;readonly source:string;readonly version:string}
export interface EmailMarketingContactState {readonly kind:'absent'|'known'|'unknown';readonly firstName?:string|null;readonly lastName?:string|null;readonly profileId:string|null;readonly marketingStatus:'subscribed'|'unsubscribed'|'suppressed'|'unknown';readonly listIds:readonly string[];readonly suppressionReasons:readonly string[];readonly unsubscribedListIds:readonly string[];readonly consentUpdatedAt:string|null;readonly observedAt:string}
export interface EmailMarketingProviderEvent {readonly eventId:string;readonly email:string;readonly profileId:string;readonly kind:'unsubscribe'|'suppressed';readonly scope:'account'|'list';readonly listId:string|null;readonly eventTime:string|null;readonly observedAt:string}
export interface EmailMarketingSuppressionPage {readonly items:readonly EmailMarketingProviderEvent[];readonly nextCursor?:string;readonly completedThrough:string|null}
export interface EmailMarketingProviderAdapter extends EmailMarketingConnectionAdapter {
 readonly capabilities:Readonly<{delta:boolean;webhook:boolean;senderChecking:boolean}>;
 contact(apiKey:string,email:string):Promise<EmailMarketingContactState>;
 updateProfile(apiKey:string,profileId:string,profile:EmailMarketingProfile):Promise<EmailMarketingProviderResult<EmailMarketingContactState>>;
 addMembership(apiKey:string,profileId:string,listId:string):Promise<EmailMarketingProviderResult<null>>;
 removeMembership(apiKey:string,profileId:string,listId:string):Promise<EmailMarketingProviderResult<null>>;
 subscribeNew(apiKey:string,profile:EmailMarketingProfile,evidence:EmailMarketingEvidence,listId:string,historical:boolean):Promise<EmailMarketingProviderResult<null>>;
 unsubscribe(apiKey:string,profileId:string,scope:{kind:'store'}|{kind:'list';listId:string}):Promise<EmailMarketingProviderResult<null>>;
 suppressionPage(apiKey:string,cursor:string|undefined,watermark:string|null):Promise<EmailMarketingSuppressionPage>;
 findWebhook?(apiKey:string,url:string,secret:string):Promise<Readonly<{kind:'verified';id:string}|{kind:'missing'}|{kind:'ambiguous'}>>;
 createWebhook?(apiKey:string,url:string,secret:string):Promise<EmailMarketingProviderResult<string>>;
 deleteWebhook?(apiKey:string,id:string):Promise<EmailMarketingProviderResult<null>>;
}
