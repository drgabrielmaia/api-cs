-- ============================================================
-- 09 - Capas dos módulos de vídeo
-- Run: docker exec -i cssystem-db psql -U postgres -d cssystem < docker/postgres/09-video-covers.sql
-- ============================================================

UPDATE video_modules SET cover_image_url = 'https://medicosderesultado.com/wp-content/uploads/2024/10/modulo-1.png'
WHERE title = 'Onboarding' AND organization_id = 'a0000000-0000-4000-8000-000000000001';

UPDATE video_modules SET cover_image_url = 'https://medicosderesultado.com/wp-content/uploads/2024/10/modulo-2.png'
WHERE title = 'Médicos de Resultado - Pocket' AND organization_id = 'a0000000-0000-4000-8000-000000000001';

UPDATE video_modules SET cover_image_url = 'https://medicosderesultado.com/wp-content/uploads/2024/10/modulo-3.png'
WHERE title = 'Posicionamento Digital Estratégico e Intencional' AND organization_id = 'a0000000-0000-4000-8000-000000000001';

UPDATE video_modules SET cover_image_url = 'https://medicosderesultado.com/wp-content/uploads/2024/10/modulo-4.png'
WHERE title = 'Atrai & Encanta' AND organization_id = 'a0000000-0000-4000-8000-000000000001';

UPDATE video_modules SET cover_image_url = 'https://medicosderesultado.com/wp-content/uploads/2024/10/modulo-5.png'
WHERE title = 'Bônus' AND organization_id = 'a0000000-0000-4000-8000-000000000001';

UPDATE video_modules SET cover_image_url = 'https://medicosderesultado.com/wp-content/uploads/2024/10/modulo-6.png'
WHERE title = 'Médicos que Vendem' AND organization_id = 'a0000000-0000-4000-8000-000000000001';
