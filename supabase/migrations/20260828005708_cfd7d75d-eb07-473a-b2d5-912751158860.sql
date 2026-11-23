WITH machine AS (
  SELECT id FROM public.machines WHERE name = 'MACHINE-01'
)
INSERT INTO public.machine_statuses (machine_id, label, position)
SELECT (SELECT id FROM machine), v.label, v.position
FROM (VALUES ('O1 - Power interruption', 1), ('O2 - Work stoppage due to external issues', 2)) AS v(label, position)
WHERE EXISTS (SELECT 1 FROM machine)
ON CONFLICT (machine_id, label) DO NOTHING;

DELETE FROM public.machine_statuses
WHERE label IN ('S - Set up (New Run)', 'R - Running')
  AND machine_id = (SELECT id FROM public.machines WHERE name = 'MACHINE-01');

UPDATE public.machine_status_logs
SET status = CASE
  WHEN status = 'S - Set up (New Run)' THEN 'O1 - Power interruption'
  WHEN status = 'R - Running' THEN 'O2 - Work stoppage due to external issues'
END
WHERE machine_name = 'MACHINE-01'
  AND status IN ('S - Set up (New Run)', 'R - Running');
