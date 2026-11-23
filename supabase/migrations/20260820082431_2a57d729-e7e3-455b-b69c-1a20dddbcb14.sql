ALTER TABLE public.machine_status_logs DROP CONSTRAINT machine_status_logs_status_check;

UPDATE public.machine_status_logs SET status = 'Status 1' WHERE status = 'Running';
UPDATE public.machine_status_logs SET status = 'Status 2' WHERE status = 'Stopped';

ALTER TABLE public.machine_status_logs
  ADD CONSTRAINT machine_status_logs_status_check CHECK (status IN ('Status 1','Status 2'));

ALTER TABLE public.machine_status_logs ALTER COLUMN status SET DEFAULT 'Status 1';