ALTER TABLE usuarios_permitidos
ADD COLUMN IF NOT EXISTS papel text DEFAULT 'viewer'
CHECK (papel IN ('admin', 'sdr', 'closer', 'viewer'));

UPDATE usuarios_permitidos SET papel = 'admin' WHERE email = 'matheus.nunes@v4company.com';
UPDATE usuarios_permitidos SET papel = 'closer' WHERE email = 'vitor.beloni@v4company.com';
UPDATE usuarios_permitidos SET papel = 'sdr' WHERE email IN ('lucca.batirola@v4company.com', 'calefi@v4company.com');
