-- 052_feature_gate_automations_flows.sql
--
-- Gates `automations` and `flows` (and their child tables) behind
-- `account_has_feature`, same mechanism as patient_records (051). Every
-- policy here is a straight re-application of the ones already in
-- production (017_account_sharing.sql) with one `AND account_has_feature(
-- ..., '<feature>')` added — the `is_account_member(...)` condition on each
-- is otherwise byte-for-byte identical to what's already live.
--
-- Safe against the existing Mayara deployment specifically because
-- 049_account_plan_fields.sql already backfilled 'automations' and 'flows'
-- into every pre-existing account's enabled_features before this migration
-- runs — this only closes the door for *new* accounts the platform admin
-- doesn't explicitly enable it for.
--
-- Idempotent — safe to re-run.

-- ---- automations -------------------------------------------------
DROP POLICY IF EXISTS automations_select ON automations;
DROP POLICY IF EXISTS automations_insert ON automations;
DROP POLICY IF EXISTS automations_update ON automations;
DROP POLICY IF EXISTS automations_delete ON automations;
CREATE POLICY automations_select ON automations FOR SELECT USING (
  is_account_member(account_id) AND account_has_feature(account_id, 'automations')
);
CREATE POLICY automations_insert ON automations FOR INSERT WITH CHECK (
  is_account_member(account_id, 'agent') AND account_has_feature(account_id, 'automations')
);
CREATE POLICY automations_update ON automations FOR UPDATE USING (
  is_account_member(account_id, 'agent') AND account_has_feature(account_id, 'automations')
) WITH CHECK (
  is_account_member(account_id, 'agent') AND account_has_feature(account_id, 'automations')
);
CREATE POLICY automations_delete ON automations FOR DELETE USING (
  is_account_member(account_id, 'agent') AND account_has_feature(account_id, 'automations')
);

-- ---- automation_logs (read-only for clients; service role inserts) -----
DROP POLICY IF EXISTS automation_logs_select ON automation_logs;
CREATE POLICY automation_logs_select ON automation_logs FOR SELECT USING (
  is_account_member(account_id) AND account_has_feature(account_id, 'automations')
);

-- ---- automation_steps (parent-join on automations) ---------------------
DROP POLICY IF EXISTS automation_steps_select ON automation_steps;
DROP POLICY IF EXISTS automation_steps_modify ON automation_steps;
CREATE POLICY automation_steps_select ON automation_steps FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM automations a
    WHERE a.id = automation_steps.automation_id
      AND is_account_member(a.account_id)
      AND account_has_feature(a.account_id, 'automations')
  )
);
CREATE POLICY automation_steps_modify ON automation_steps FOR ALL USING (
  EXISTS (
    SELECT 1 FROM automations a
    WHERE a.id = automation_steps.automation_id
      AND is_account_member(a.account_id, 'agent')
      AND account_has_feature(a.account_id, 'automations')
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM automations a
    WHERE a.id = automation_steps.automation_id
      AND is_account_member(a.account_id, 'agent')
      AND account_has_feature(a.account_id, 'automations')
  )
);

-- ---- flows ---------------------------------------------------------
DROP POLICY IF EXISTS flows_select ON flows;
DROP POLICY IF EXISTS flows_insert ON flows;
DROP POLICY IF EXISTS flows_update ON flows;
DROP POLICY IF EXISTS flows_delete ON flows;
CREATE POLICY flows_select ON flows FOR SELECT USING (
  is_account_member(account_id) AND account_has_feature(account_id, 'flows')
);
CREATE POLICY flows_insert ON flows FOR INSERT WITH CHECK (
  is_account_member(account_id, 'agent') AND account_has_feature(account_id, 'flows')
);
CREATE POLICY flows_update ON flows FOR UPDATE USING (
  is_account_member(account_id, 'agent') AND account_has_feature(account_id, 'flows')
) WITH CHECK (
  is_account_member(account_id, 'agent') AND account_has_feature(account_id, 'flows')
);
CREATE POLICY flows_delete ON flows FOR DELETE USING (
  is_account_member(account_id, 'agent') AND account_has_feature(account_id, 'flows')
);

-- ---- flow_runs (service-role driven; read-only for clients) -----------
DROP POLICY IF EXISTS flow_runs_select ON flow_runs;
CREATE POLICY flow_runs_select ON flow_runs FOR SELECT USING (
  is_account_member(account_id) AND account_has_feature(account_id, 'flows')
);

-- ---- flow_nodes (parent-join on flows) --------------------------------
DROP POLICY IF EXISTS flow_nodes_select ON flow_nodes;
DROP POLICY IF EXISTS flow_nodes_modify ON flow_nodes;
CREATE POLICY flow_nodes_select ON flow_nodes FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM flows f
    WHERE f.id = flow_nodes.flow_id
      AND is_account_member(f.account_id)
      AND account_has_feature(f.account_id, 'flows')
  )
);
CREATE POLICY flow_nodes_modify ON flow_nodes FOR ALL USING (
  EXISTS (
    SELECT 1 FROM flows f
    WHERE f.id = flow_nodes.flow_id
      AND is_account_member(f.account_id, 'agent')
      AND account_has_feature(f.account_id, 'flows')
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM flows f
    WHERE f.id = flow_nodes.flow_id
      AND is_account_member(f.account_id, 'agent')
      AND account_has_feature(f.account_id, 'flows')
  )
);

-- ---- flow_run_events (parent-join on flow_runs) -----------------------
DROP POLICY IF EXISTS flow_run_events_select ON flow_run_events;
CREATE POLICY flow_run_events_select ON flow_run_events FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM flow_runs r
    WHERE r.id = flow_run_events.flow_run_id
      AND is_account_member(r.account_id)
      AND account_has_feature(r.account_id, 'flows')
  )
);
