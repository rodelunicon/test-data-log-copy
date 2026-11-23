ALTER TABLE public.machines
  ADD COLUMN current_status text,
  ADD COLUMN current_started_at timestamptz;

CREATE OR REPLACE FUNCTION public.record_machine_status_transition(
  p_machine_name text,
  p_current_status text,
  p_current_started_at timestamptz,
  p_previous_status text,
  p_previous_started_at timestamptz,
  p_previous_ended_at timestamptz,
  p_previous_duration_seconds integer
)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  UPDATE public.machines
  SET current_status = p_current_status,
      current_started_at = p_current_started_at
  WHERE lower(name) = lower(trim(p_machine_name));

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown machine: %', p_machine_name;
  END IF;

  IF p_previous_status IS NOT NULL THEN
    UPDATE public.machine_status_logs
    SET status = p_previous_status,
        started_at = p_previous_started_at,
        ended_at = p_previous_ended_at,
        duration_seconds = p_previous_duration_seconds
    WHERE id = (
      SELECT id
      FROM public.machine_status_logs
      WHERE machine_name = trim(p_machine_name)
        AND ended_at IS NULL
      ORDER BY started_at DESC
      LIMIT 1
      FOR UPDATE
    );

    IF NOT FOUND THEN
      INSERT INTO public.machine_status_logs (
        machine_name,
        status,
        started_at,
        ended_at,
        duration_seconds
      )
      VALUES (
        trim(p_machine_name),
        p_previous_status,
        p_previous_started_at,
        p_previous_ended_at,
        p_previous_duration_seconds
      );
    END IF;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.record_machine_status_transition(
  text,
  text,
  timestamptz,
  text,
  timestamptz,
  timestamptz,
  integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_machine_status_transition(
  text,
  text,
  timestamptz,
  text,
  timestamptz,
  timestamptz,
  integer
) TO service_role;
