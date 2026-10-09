import type {EmailMarketingProvider} from '@celebix/saas-contracts';
import type {EmailMarketingProviderAdapter} from '../provider.ts';
import type {EmailMarketingTransportOptions} from '../transport.ts';
import {createBrevoEmailMarketingAdapter} from './brevo.ts';
import {createKlaviyoEmailMarketingAdapter} from './klaviyo.ts';
export function createEmailMarketingProviders(options:EmailMarketingTransportOptions):Readonly<Record<EmailMarketingProvider,EmailMarketingProviderAdapter>>{return Object.freeze({brevo:createBrevoEmailMarketingAdapter(options),klaviyo:createKlaviyoEmailMarketingAdapter(options)});}
