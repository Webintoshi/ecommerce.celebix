import 'server-only';
import { readCommerceBridgeKey, readCommerceDataKey, commerceDigest } from './security.ts';
import type { PlatformIyzicoConfig } from './iyzico.ts';

export interface PlatformCommerceConfig {
  bridgeKey: Buffer; dataKey: Buffer; credentialFingerprint: string; gateway: PlatformIyzicoConfig;
}
export function readPlatformCommerceConfig(source: Readonly<Record<string,string|undefined>> = process.env): PlatformCommerceConfig | null {
  if (source.CELEBIX_PLATFORM_COMMERCE_ENABLED !== 'true') return null;
  try {
    const mode = source.CELEBIX_PLATFORM_IYZICO_MODE;
    if (mode !== 'test' && mode !== 'live') throw Error();
    const apiKey = source.CELEBIX_PLATFORM_IYZICO_API_KEY, secretKey = source.CELEBIX_PLATFORM_IYZICO_SECRET_KEY;
    for (const value of [apiKey, secretKey]) if (typeof value !== 'string' || !value || value.length > 512 || value.trim() !== value || /[\u0000-\u0020\u007f-\u009f]/u.test(value)) throw Error();
    const bridgeKey = readCommerceBridgeKey(source), dataKey = readCommerceDataKey(source);
    if (bridgeKey.equals(dataKey)) throw Error();
    return Object.freeze({ bridgeKey, dataKey,
      credentialFingerprint: commerceDigest(JSON.stringify({mode,apiKey,secretKey})),
      gateway: Object.freeze({mode,apiKey:apiKey!,secretKey:secretKey!,callbackOrigin:'https://celebix.net'}) });
  } catch { throw Error('platform_commerce_configuration_invalid'); }
}
