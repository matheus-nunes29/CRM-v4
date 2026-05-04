-- Adiciona campo de responsável BDR nos leads
ALTER TABLE leads ADD COLUMN IF NOT EXISTS bdr text;

-- Permite leitura de usuarios_permitidos para usuários autenticados
CREATE POLICY IF NOT EXISTS "Autenticados podem ler usuarios_permitidos"
ON usuarios_permitidos FOR SELECT
TO authenticated
USING (true);

-- Sincroniza avatar_url de novos logins automaticamente
CREATE OR REPLACE FUNCTION sync_user_avatar()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE usuarios_permitidos
  SET avatar_url = NEW.raw_user_meta_data->>'avatar_url'
  WHERE email = NEW.email AND avatar_url IS DISTINCT FROM NEW.raw_user_meta_data->>'avatar_url';
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_sync_avatar ON auth.users;
CREATE TRIGGER tr_sync_avatar
AFTER INSERT OR UPDATE ON auth.users
FOR EACH ROW EXECUTE FUNCTION sync_user_avatar();
