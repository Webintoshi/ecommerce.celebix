-- Manual release and quote expiry are immutable financial audit history. Correct forward.
BEGIN;
DO $guard$BEGIN RAISE EXCEPTION 'STORE_TOOL_MANUAL287_FORWARD_ONLY';END $guard$;
ROLLBACK;
