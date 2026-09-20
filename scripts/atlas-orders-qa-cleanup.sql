-- Retired: physical QA order deletion is not an allowed lifecycle operation.
-- Fail closed so historical commands cannot delete immutable order history.
-- See docs/qa/atlas-orders-qa-archive.md for the authorized archive workflow.
\set ON_ERROR_STOP on
DO $retired$
BEGIN
  RAISE EXCEPTION 'ORDERS_QA_PHYSICAL_DELETE_RETIRED';
END
$retired$;
