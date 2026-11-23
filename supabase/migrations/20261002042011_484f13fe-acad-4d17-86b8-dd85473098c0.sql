CREATE TABLE public.editor_account (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  username text NOT NULL,
  password_salt text NOT NULL,
  password_hash text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.editor_account TO service_role;
ALTER TABLE public.editor_account ENABLE ROW LEVEL SECURITY;
INSERT INTO public.editor_account (id, username, password_salt, password_hash)
VALUES (1, 'lipi@obudan', '0a91034b356a8d550c3485d64bd3e220', '7046b7e45dbda2df5229bdde8a856888d5469802bf7c7bb83c836ab91e0138ce');