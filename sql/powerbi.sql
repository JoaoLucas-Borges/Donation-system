-- Usuário "powerbi": só lê evento e as views vw_*. Não vê operador (hash dos códigos)
-- nem consegue alterar nada. Rode DEPOIS do views.sql, passando a senha na hora
-- (assim ela não fica salva no repositório):
--
--   psql ... -v senha='uma-senha-forte' -f sql/powerbi.sql
--
-- Pode rodar de novo: se o usuário já existe, só troca a senha e refaz as permissões.

SELECT 'CREATE ROLE powerbi LOGIN'
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'powerbi') \gexec

ALTER ROLE powerbi WITH LOGIN PASSWORD :'senha';

GRANT CONNECT ON DATABASE sopao TO powerbi;
GRANT USAGE ON SCHEMA public TO powerbi;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM powerbi;
GRANT SELECT ON evento, vw_itens, vw_distribuicao, vw_conferencia_notas, vw_resumo_evento TO powerbi;
