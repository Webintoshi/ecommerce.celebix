-- Sealed credential rotation and immutable provider audit history are retained.
DO $forward$BEGIN RAISE EXCEPTION 'TOSHI_CENTRAL284_FORWARD_ONLY';END $forward$;
