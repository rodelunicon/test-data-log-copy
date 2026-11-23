INSERT INTO public.machines (name) VALUES ('MACHINE-01') ON CONFLICT (name) DO NOTHING;

WITH machine AS (
  SELECT id FROM public.machines WHERE name = 'MACHINE-01'
)
INSERT INTO public.machine_statuses (machine_id, label, position)
SELECT (SELECT id FROM machine), v.label, v.position
FROM (VALUES ('O1 - Power interruption', 1), ('O2 - Work stoppage due to external issues', 2)) AS v(label, position)
WHERE EXISTS (SELECT 1 FROM machine)
ON CONFLICT (machine_id, label) DO NOTHING;

DELETE FROM public.machine_statuses AS legacy
USING public.machines AS machine
WHERE legacy.machine_id = machine.id
  AND machine.name = 'MACHINE-01'
  AND legacy.label IN ('Status 1', 'Status 2')
  AND EXISTS (
    SELECT 1
    FROM public.machine_statuses AS current
    WHERE current.machine_id = legacy.machine_id
      AND current.label = CASE legacy.label
        WHEN 'Status 1' THEN 'O1 - Power interruption'
        WHEN 'Status 2' THEN 'O2 - Work stoppage due to external issues'
      END
  );

WITH machine AS (
  SELECT id FROM public.machines WHERE name = 'MACHINE-01'
)
UPDATE public.machine_statuses
SET label = CASE
  WHEN label = 'Status 1' THEN 'O1 - Power interruption'
  WHEN label = 'Status 2' THEN 'O2 - Work stoppage due to external issues'
END
WHERE machine_id = (SELECT id FROM machine)
  AND label IN ('Status 1', 'Status 2');

UPDATE public.machine_status_logs
SET status = CASE
  WHEN status = 'Status 1' THEN 'O1 - Power interruption'
  WHEN status = 'Status 2' THEN 'O2 - Work stoppage due to external issues'
END
WHERE machine_name = 'MACHINE-01'
  AND status IN ('Status 1', 'Status 2');
