const MAXIMUM_CHECKOUT_RESULT_REFRESHES = 5;

export function nextCheckoutResultRefreshAttempt(
  current: number,
): number | null {
  if (
    !Number.isSafeInteger(current)
    || current < 0
    || current > MAXIMUM_CHECKOUT_RESULT_REFRESHES
  ) {
    throw new Error("checkout_result_refresh_invalid");
  }
  return current === MAXIMUM_CHECKOUT_RESULT_REFRESHES ? null : current + 1;
}
