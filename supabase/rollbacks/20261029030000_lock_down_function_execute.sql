-- Rollback of 20261029030000_lock_down_function_execute.sql
-- Restores the previous (unsafe) state: every public function executable by anon and authenticated.
-- Only use this if the lock-down breaks the app, then fix the missing grant and re-apply.
grant execute on all functions in schema public to anon, authenticated;
alter default privileges for role postgres in schema public
  grant execute on functions to anon, authenticated;
