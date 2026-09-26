BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
LOCK TABLE saas.toshi_conversations,saas.toshi_messages,saas.toshi_generation_operations,saas.toshi_generation_events IN ACCESS EXCLUSIVE MODE;
DO $rollback$
BEGIN
 IF EXISTS(SELECT 1 FROM saas.toshi_conversations) OR EXISTS(SELECT 1 FROM saas.toshi_messages)
  OR EXISTS(SELECT 1 FROM saas.toshi_generation_operations) OR EXISTS(SELECT 1 FROM saas.toshi_generation_events) THEN
  RAISE EXCEPTION 'TOSHI_CONVERSATIONS_ROLLBACK_DATA_PRESENT';
 END IF;
END $rollback$;
DROP FUNCTION saas.toshi_conversation_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz);
DROP FUNCTION saas.toshi_conversation_get(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid);
DROP FUNCTION saas.toshi_conversation_begin_turn(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text);
DROP FUNCTION saas.toshi_conversation_complete_turn(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,jsonb);
DROP FUNCTION saas.toshi_conversation_fail_turn(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text);
DROP FUNCTION saas.toshi_conversation_recover_turn(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,text);
DROP FUNCTION saas.toshi_conversation_public_payload(uuid,uuid,uuid);
DROP FUNCTION saas.toshi_conversation_summary(uuid,uuid,uuid);
DROP TABLE saas.toshi_generation_events;
DROP FUNCTION saas.guard_toshi_generation_event_immutability();
DROP TABLE saas.toshi_messages;
DROP TABLE saas.toshi_generation_operations;
DROP TABLE saas.toshi_conversations;
DROP FUNCTION saas.toshi_conversation_sources_valid(jsonb);
COMMIT;
