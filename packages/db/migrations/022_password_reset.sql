ALTER TABLE users ADD COLUMN session_version integer NOT NULL DEFAULT 0;
CREATE FUNCTION bump_password_session_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.password_hash IS DISTINCT FROM OLD.password_hash THEN
    NEW.session_version := OLD.session_version + 1;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER users_password_session_version BEFORE UPDATE OF password_hash ON users
FOR EACH ROW EXECUTE FUNCTION bump_password_session_version();

CREATE TABLE password_reset_tokens (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  portal text NOT NULL CHECK (portal IN ('admin','business','rider')),
  session_version integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz
);
CREATE INDEX password_reset_user_idx ON password_reset_tokens(user_id);
CREATE TABLE password_reset_limits (
  key_hash text PRIMARY KEY,
  window_start timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 1
);
