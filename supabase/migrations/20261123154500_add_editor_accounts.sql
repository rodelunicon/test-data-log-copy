ALTER TABLE public.editor_account
  DROP CONSTRAINT editor_account_id_check,
  DROP CONSTRAINT editor_account_pkey,
  ALTER COLUMN id DROP NOT NULL,
  ALTER COLUMN id DROP DEFAULT;

ALTER TABLE public.editor_account
  ADD COLUMN account_id uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD PRIMARY KEY (account_id);

CREATE UNIQUE INDEX editor_account_username_lower_idx
  ON public.editor_account (lower(username));

UPDATE public.editor_account
SET password_salt = '69da9f9b33ebdc1daf48b1a437b91051',
    password_hash = '3f6cbfad82e5c5a0fc92466a8a62bcdd04a868c5b6c374169ddb7a52365fdb81',
    updated_at = now()
WHERE lower(username) = lower('lipi@obudan');

INSERT INTO public.editor_account (username, password_salt, password_hash)
SELECT 'lipi@obudan', '69da9f9b33ebdc1daf48b1a437b91051', '3f6cbfad82e5c5a0fc92466a8a62bcdd04a868c5b6c374169ddb7a52365fdb81'
WHERE NOT EXISTS (
  SELECT 1
  FROM public.editor_account
  WHERE lower(username) = lower('lipi@obudan')
);
