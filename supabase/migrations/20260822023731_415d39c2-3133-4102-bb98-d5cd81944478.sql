DROP POLICY IF EXISTS "Anyone can view machine status logs" ON public.machine_status_logs;
DROP POLICY IF EXISTS "Anyone can add machine status logs" ON public.machine_status_logs;
DROP POLICY IF EXISTS "Anyone can close machine status logs" ON public.machine_status_logs;

REVOKE ALL ON public.machine_status_logs FROM anon;

GRANT SELECT ON public.machine_status_logs TO authenticated;
GRANT ALL ON public.machine_status_logs TO service_role;

CREATE POLICY "Authenticated users can view machine status logs"
  ON public.machine_status_logs FOR SELECT TO authenticated USING (true);