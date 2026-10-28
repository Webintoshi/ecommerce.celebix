-- Public paid gifts and their immutable financial provenance require forward-only recovery.
DO $down289$BEGIN RAISE EXCEPTION 'PUBLIC_TEST289_FORWARD_ONLY';END $down289$;
