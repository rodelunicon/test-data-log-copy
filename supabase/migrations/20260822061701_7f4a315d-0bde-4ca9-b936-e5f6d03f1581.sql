CREATE TABLE public.machines (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL UNIQUE,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.machines TO authenticated;
GRANT ALL ON public.machines TO service_role;

ALTER TABLE public.machines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view machines"
  ON public.machines FOR SELECT TO authenticated USING (true);

CREATE TABLE public.machine_statuses (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  machine_id uuid NOT NULL REFERENCES public.machines(id) ON DELETE CASCADE,
  label text NOT NULL,
  position integer NOT NULL DEFAULT 1,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (machine_id, label)
);

CREATE INDEX machine_statuses_machine_id_idx ON public.machine_statuses(machine_id);

GRANT SELECT ON public.machine_statuses TO authenticated;
GRANT ALL ON public.machine_statuses TO service_role;

ALTER TABLE public.machine_statuses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view machine statuses"
  ON public.machine_statuses FOR SELECT TO authenticated USING (true);

ALTER TABLE public.machine_status_logs DROP CONSTRAINT IF EXISTS machine_status_logs_status_check;

CREATE INDEX IF NOT EXISTS machine_status_logs_machine_name_idx ON public.machine_status_logs(machine_name);

INSERT INTO public.machines (name) VALUES ('MACHINE-01') ON CONFLICT (name) DO NOTHING;

INSERT INTO public.machine_statuses (machine_id, label, position)
SELECT m.id, v.label, v.position
FROM public.machines m,
     (VALUES ('Status 1', 1), ('Status 2', 2)) AS v(label, position)
WHERE m.name = 'MACHINE-01'
ON CONFLICT (machine_id, label) DO NOTHING;