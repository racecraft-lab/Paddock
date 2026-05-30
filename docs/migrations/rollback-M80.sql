-- Manual rollback for M80 / 080_agent_sandbox_lifecycles.
--
-- Back up or export agent_sandbox_lifecycles and
-- agent_sandbox_lifecycle_events before running this rollback if lifecycle
-- evidence must be retained outside SQLite.

PRAGMA foreign_keys = OFF;

DROP INDEX IF EXISTS idx_agent_sandbox_lifecycle_events_sandbox_order;
DROP INDEX IF EXISTS idx_agent_sandbox_lifecycle_events_task_order;
DROP INDEX IF EXISTS idx_agent_sandbox_lifecycle_events_lifecycle_order;
DROP INDEX IF EXISTS idx_agent_sandbox_lifecycles_claim;
DROP INDEX IF EXISTS idx_agent_sandbox_lifecycles_attempt;
DROP INDEX IF EXISTS idx_agent_sandbox_lifecycles_task_status;
DROP TABLE IF EXISTS agent_sandbox_lifecycle_events;
DROP TABLE IF EXISTS agent_sandbox_lifecycles;

DELETE FROM schema_migrations WHERE id = '080_agent_sandbox_lifecycles';

PRAGMA foreign_keys = ON;
