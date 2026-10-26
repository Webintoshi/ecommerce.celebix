-- Expiry and immutable provenance are financial history. Correct forward.
BEGIN;
DO $guard$BEGIN RAISE EXCEPTION 'PLATFORM_CHECKOUT282_FORWARD_ONLY';END $guard$;
ROLLBACK;
