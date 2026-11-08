# Sistema Sopão

Sistema para a campanha de doação **Sopão**: registra as compras de alimentos, conta as porções distribuídas no dia da campanha e alimenta um relatório no Power BI para a prestação de contas (valor gasto convertido em porções).

Prazo: núcleo pronto em 2 dias. Prioridade é **simples, rápido de usar e confiável no dia da campanha**.

## Regras para o assistente

- Mantenha tudo simples. Sem microsserviços, sem filas de tarefas (Celery/Redis), sem framework de front (React etc.), sem build de JS.
- Um único app Flask (monolito) organizado em blueprints. Toda regra de negócio fica nas rotas `/api/*`; as páginas Jinja são finas e chamam a API com `fetch`.
- Código, tabelas, rotas e variáveis em português, sem acento (`distribuicao`, `operador`).
- O Power BI **não** usa a API: lê direto das views `vw_*` do Postgres. Não quebre o contrato das views sem avisar.
- Desfazer nunca apaga: grava uma linha com `quantidade = -1`.
- A extração de nota fiscal com IA é **fase 2**. Não implemente agora, mas mantenha o upload da foto preparado para ela.
- Antes de adicionar uma dependência nova, pergunte.
- Ao terminar uma etapa, atualize a seção "Estado atual" deste arquivo.

## Stack

- Python 3, Flask 3 com Blueprints, Flask-SQLAlchemy, psycopg 3, Flask-Limiter
- PostgreSQL 16 (docker compose)
- Jinja + HTML/CSS/JS puro
- Deploy: VPS de baixo custo com docker compose (Postgres + app com gunicorn + Caddy para HTTPS)
- BI: Power BI Desktop, conector PostgreSQL, modo Importação

## Estrutura de pastas

```
sopao/
├── app/
│   ├── __init__.py          # create_app(), registra os blueprints
│   ├── config.py            # lê o .env
│   ├── db.py                # instância do SQLAlchemy
│   ├── models.py            # Evento, Compra, ItemCompra, Distribuicao, Operador
│   ├── auth/                # login por código, decorator login_required
│   ├── compras/             # páginas + API de compras e itens
│   ├── distribuicao/        # tela de contagem + API de porções
│   ├── notas/               # upload da foto (extração = fase 2)
│   ├── templates/
│   └── static/
├── sql/
│   ├── schema.sql           # fonte da verdade do esquema
│   └── views.sql            # contrato com o Power BI
├── uploads/
├── docker-compose.yml
├── Caddyfile
├── .env
└── run.py
```

## Modelo de dados

Cada dia de campanha é um `evento`. Um ponto de distribuição por dia (sem campo `posto`; se precisar de vários pontos, volta com `ALTER TABLE`).

- **evento**: id, nome, data, local
- **operador**: id, nome, codigo_hash (nunca o código puro), ativo
- **compra**: id, evento_id, operador_id, data_compra, fornecedor, cnpj_emitente CHAR(14), numero_nota, chave_acesso CHAR(44) UNIQUE, valor_total NUMERIC(10,2), foto_path, origem_dados (`manual` | `qr` | `ia`, padrão `manual`), criado_em
- **item_compra**: id, compra_id (ON DELETE CASCADE), descricao, categoria, quantidade NUMERIC(10,3), unidade (kg, un, l, pct), valor_unitario NUMERIC(10,2), valor_total gerado = `round(quantidade * valor_unitario, 2)`
- **distribuicao**: id BIGSERIAL, evento_id, operador_id, quantidade INT (1 ou -1), client_id UUID UNIQUE (torna o reenvio da fila offline seguro, não remover), clicado_em (hora do clique, vinda do navegador), registrado_em

### Views para o Power BI (`sql/views.sql`)

- `vw_itens`: item_compra + evento_id, data_compra, fornecedor, numero_nota
- `vw_distribuicao`: evento_id, quantidade, clicado_em, `date_trunc('hour', clicado_em) AS hora`
- `vw_conferencia_notas`: valor_total da nota x soma dos itens, com a diferença
- Role `powerbi` só com `SELECT` em `evento` e nas views

Medidas DAX previstas: Total Gasto, Porções, Custo por Porção, Notas com Diferença.

## Rotas

| Método | Rota | Tipo | O que faz |
| --- | --- | --- | --- |
| GET, POST | `/login`, `/logout` | Página | Login por código numérico |
| GET | `/` | Página | Painel com totais do evento ativo |
| GET | `/compras`, `/compras/nova`, `/compras/<id>/editar` | Página | Lista e formulário com itens dinâmicos |
| GET | `/contagem/<evento_id>` | Página | Tela do espaço, em tela cheia |
| GET, POST | `/api/eventos` | JSON | Lista e cria eventos |
| GET, POST | `/api/compras` | JSON | Lista e cria compra com itens |
| GET, PUT, DELETE | `/api/compras/<id>` | JSON | Detalhe, edição, remoção |
| POST | `/api/notas/upload` | JSON | Salva a foto (nome UUID) e devolve o caminho |
| GET | `/notas/foto/<nome>` | Arquivo | Mostra a foto salva (só nomes gerados pelo upload) |
| POST | `/api/distribuicoes` | JSON | Recebe um clique ou um lote da fila offline |
| GET | `/api/eventos/<id>/contador` | JSON | Total atual de porções |

`POST /api/distribuicoes` aceita objeto ou lista: `{evento_id, quantidade, client_id, clicado_em}`. Usar `INSERT ... ON CONFLICT (client_id) DO NOTHING` para o reenvio ser seguro. Responde `{confirmados: [client_id], rejeitados: [{client_id, erro}]}`; o navegador tira os dois da fila. `clicado_em` no futuro (relógio errado) é trocado pela hora do servidor, nunca recusado.

Todas as páginas e `/api/*` exigem login (`@login_required`), exceto `/login`.

## Login por código

- Cada pessoa tem um código numérico de 6 dígitos, gerado pelo comando `flask criar-operador "Nome"` (imprime o código uma vez).
- Hash com `werkzeug.security` (`generate_password_hash` / `check_password_hash`); poucos operadores, então varrer os ativos para autenticar é aceitável.
- Sessão do Flask válida pelo dia. Flask-Limiter na rota de login (ex.: 5 tentativas por minuto por IP).
- `operador_id` gravado em cada compra e porção.

## Tela de contagem (crítica no dia)

- Espaço = +1, Backspace = −1, com feedback visual diferente.
- Ignorar tecla segurada (`e.repeat`) e cliques com intervalo menor que ~300 ms; `preventDefault()` no espaço.
- Otimista: soma na tela na hora, guarda o clique numa fila no `localStorage` (com `crypto.randomUUID()` e `clicado_em`) e envia em segundo plano a cada poucos segundos.
- Remover da fila só os itens confirmados pelo servidor, para não perder clique feito durante o envio.
- Indicador de online/offline e de cliques pendentes.

## Deploy

- `docker-compose.yml` com `db` (porta só em `127.0.0.1:5432`), `app` (gunicorn) e `caddy` (80/443).
- `Caddyfile`: `sopao.<dominio> { reverse_proxy app:8000 }`.
- Power BI acessa por túnel: `ssh -L 5432:localhost:5432 usuario@ip-do-vps`, servidor `localhost` no Power BI.
- Backup: `pg_dump` diário por cron + cópia do volume de uploads.

## Comandos

```bash
docker compose up -d db                 # Postgres local
flask --app run.py run --debug          # app em desenvolvimento
flask --app run.py criar-operador "Nome"
psql ... -f sql/schema.sql && psql ... -f sql/views.sql
```

## Plano

1. Dia 1, manhã: compose do Postgres, `schema.sql`, modelos, `create_app`, CRUD de compras e itens via API.
2. Dia 1, tarde: páginas de compras com upload da foto; tela de contagem com fila offline e desfazer.
3. Dia 2, manhã: login por código; `views.sql` e relatório no Power BI com dados de teste.
4. Dia 2, tarde: deploy no VPS, túnel SSH para o Power BI, teste de ponta a ponta.
5. Fase 2: extração da nota (QR code da NFC-e para chave/número/CNPJ; LLM com visão para os itens, sempre com revisão humana antes de salvar).

## Estado atual

- [x] Postgres no docker compose (porta local 127.0.0.1:5433), `schema.sql`, `models.py`, `config.py`, `db.py`, `create_app()` com `/saude`.
- [x] Coluna `posto` removida de `distribuicao` (schema, modelo e banco local).
- [x] API de eventos e compras, validação em `app/validacao.py`, erros da API em JSON.
- [x] API de distribuição (`/api/distribuicoes`, contador) e upload/exibição da foto (`app/notas/`).
- [x] Login por código (`/login`, `/logout`), `login_required`, `flask criar-operador`. Sessão de 14 h, cookie SameSite=Lax.
- [x] Interface: painel (totais + criar evento), lista e formulário de compras com itens dinâmicos e foto, tela de contagem com fila offline. JS em `app/static/js/`, CSS em `app/static/css/estilo.css`.
- [x] Backend testado contra o banco local; contas de dinheiro do JS conferidas com o `round` do Postgres.
- [ ] Testar a interface no navegador (ainda não foi aberta num navegador de verdade).
- [x] Flask-Limiter no login (`app/limitador.py`): 5 tentativas erradas por minuto por IP; acerto não conta. Armazenamento em memória.
- [ ] `views.sql` e role `powerbi`.
- [ ] Deploy (Dockerfile, Caddy, backup). Em produção: `SESSION_COOKIE_SECURE=1` e `ATRAS_DE_PROXY=1` no `.env` (sem o segundo, o limite de login vê todo mundo com o IP do Caddy).
