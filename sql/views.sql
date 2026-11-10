-- Contrato com o Power BI (e com a página /relatorio do app).
-- O Power BI lê só estas views e a tabela evento. Mudou coluna aqui? Avise:
-- o relatório do Power BI quebra se uma coluna sumir ou mudar de nome.
--
-- Pode rodar quantas vezes quiser: CREATE OR REPLACE só troca a definição.
--   psql ... -f sql/views.sql
--
-- Horários: o banco guarda em UTC (timestamptz). As views convertem para o
-- horário de Brasília, para "porções por hora" bater com o relógio da campanha.

-- Cada item comprado, com os dados da nota a que pertence
CREATE OR REPLACE VIEW vw_itens AS
SELECT
    i.id,
    i.compra_id,
    i.descricao,
    i.categoria,
    i.quantidade,
    i.unidade,
    i.valor_unitario,
    i.valor_total,
    c.evento_id,
    c.data_compra,
    c.fornecedor,
    c.numero_nota
FROM item_compra i
JOIN compra c ON c.id = i.compra_id;

-- Cada clique da contagem (+1 ou -1). Somar quantidade = porções servidas.
CREATE OR REPLACE VIEW vw_distribuicao AS
SELECT
    evento_id,
    quantidade,
    clicado_em,
    date_trunc('hour', clicado_em AT TIME ZONE 'America/Sao_Paulo') AS hora
FROM distribuicao;

-- Conferência: o total da nota bate com a soma dos itens?
CREATE OR REPLACE VIEW vw_conferencia_notas AS
SELECT
    c.id AS compra_id,
    c.evento_id,
    c.data_compra,
    c.fornecedor,
    c.numero_nota,
    c.valor_total,
    COALESCE(SUM(i.valor_total), 0) AS soma_itens,
    c.valor_total - COALESCE(SUM(i.valor_total), 0) AS diferenca,
    c.foto_path IS NOT NULL AS tem_comprovante
FROM compra c
LEFT JOIN item_compra i ON i.compra_id = c.id
GROUP BY c.id;

-- Uma linha por evento com os números da prestação de contas.
-- As subconsultas evitam multiplicar linhas ao juntar compras com cliques.
CREATE OR REPLACE VIEW vw_resumo_evento AS
SELECT
    e.id AS evento_id,
    e.nome,
    e.data,
    e.local,
    g.total_gasto,
    g.qtd_compras,
    p.porcoes,
    CASE WHEN p.porcoes > 0 THEN round(g.total_gasto / p.porcoes, 2) END AS custo_por_porcao
FROM evento e
CROSS JOIN LATERAL (
    SELECT COALESCE(SUM(valor_total), 0) AS total_gasto, COUNT(*) AS qtd_compras
    FROM compra WHERE evento_id = e.id
) g
CROSS JOIN LATERAL (
    SELECT COALESCE(SUM(quantidade), 0) AS porcoes
    FROM distribuicao WHERE evento_id = e.id
) p;
