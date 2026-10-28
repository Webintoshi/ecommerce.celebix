-- Paid immutable orders and wallet ledger history must remain interpretable.
DO $down288$BEGIN RAISE EXCEPTION 'TOSHI_TEST_CREDIT288_FORWARD_ONLY';END $down288$;
