import {EmailMarketingError} from './errors.ts';
import type {createEmailMarketingTransport} from './transport.ts';

type Request = ReturnType<typeof createEmailMarketingTransport>['request'];

// Track the recipient effect separately from preflight reads and harmless schema
// preparation. Only explicit rejection/no send permits a new outbound attempt.
export async function recipientMutation<T>(request: Request, run: (effect: Request) => Promise<T>): Promise<T> {
  let mayHaveApplied = false;
  const effect: Request = async (...args) => {
    try {
      const result = await request(...args);
      mayHaveApplied = true;
      return result;
    } catch (error) {
      if (!(error instanceof EmailMarketingError) || error.code === 'outcome_unknown') mayHaveApplied = true;
      throw error;
    }
  };
  try { return await run(effect); }
  catch (error) {
    if (mayHaveApplied) throw new EmailMarketingError('outcome_unknown', null, error instanceof EmailMarketingError && error.credentialRejected);
    const safe = new EmailMarketingError(error instanceof EmailMarketingError ? error.code : 'provider_unavailable', error instanceof EmailMarketingError ? error.retryAfterSeconds : null, error instanceof EmailMarketingError && error.credentialRejected);
    Object.defineProperty(safe, 'effectNotApplied', {value: true});
    throw safe;
  }
}
