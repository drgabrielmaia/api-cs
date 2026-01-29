-- Corrigir telefones das organizações para formato padrão

-- 1. Corrigir telefone da Admin Organization (remover dígito extra)
UPDATE organizations
SET admin_phone = '+5583996910414'
WHERE id = '9c8c0033-15ea-4e33-a55f-28d81a19693b'
  AND admin_phone = '+558396910414';

-- 2. Adicionar telefone para Organização Temp2 (mesmo número admin por enquanto)
UPDATE organizations
SET admin_phone = '+5583996910414'
WHERE id = 'f9cf9d0e-ed74-4367-94f7-226ffc2f3273'
  AND admin_phone IS NULL;

-- 3. Verificar resultado
SELECT id, name, admin_phone, owner_email
FROM organizations
WHERE admin_phone IS NOT NULL
ORDER BY name;

SELECT 'Telefones das organizações corrigidos!' as status;