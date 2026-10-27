-- Wallet and payment entries are financial history. Correct forward.
BEGIN;
DO $guard$BEGIN RAISE EXCEPTION 'TOSHI_CREDITS283_FORWARD_ONLY';END $guard$;
ROLLBACK;
