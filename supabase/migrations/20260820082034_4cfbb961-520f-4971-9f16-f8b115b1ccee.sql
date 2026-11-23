CREATE TABLE public.machine_status_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  machine_name text NOT NULL DEFAULT 'MACHINE-01',
  status text NOT NULL CHECK (status IN ('Running','Stopped')),
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  duration_seconds integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.machine_status_logs TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.machine_status_logs TO authenticated;
GRANT ALL ON public.machine_status_logs TO service_role;

ALTER TABLE public.machine_status_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view machine status logs" ON public.machine_status_logs FOR SELECT USING (true);
CREATE POLICY "Anyone can add machine status logs" ON public.machine_status_logs FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can close machine status logs" ON public.machine_status_logs FOR UPDATE USING (true) WITH CHECK (true);

CREATE INDEX machine_status_logs_started_at_idx ON public.machine_status_logs (machine_name, started_at DESC);

INSERT INTO public.machine_status_logs (machine_name, status, started_at) VALUES ('MACHINE-01', 'Stopped', now());