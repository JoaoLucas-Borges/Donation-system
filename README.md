<img width="3200" height="1000" alt="sopao-banner-final" src="https://github.com/user-attachments/assets/1a282df4-7faf-4166-8748-86a5226ff590" />
<br>
<br>
O Sopão é um sistema web para igrejas e grupos que fazem campanhas de distribuição de comida (sopa, marmitas, cestas). Ele cobre o ciclo inteiro da prestação de contas:

1. **Compras**: cada nota fiscal de alimento é registrada com seus itens e com a foto do comprovante. A IA pode ler a foto e preencher os campos, mas uma pessoa sempre revisa antes de salvar.
2. **Distribuição**: no dia da campanha, um operador conta as porções entregues numa tela de contagem que continua funcionando sem internet.
3. **Relatório**: o app cruza o valor gasto com as porções servidas (custo por porção, gasto por fornecedor, porções por hora, notas a conferir) e exporta tudo para o Power BI ou o Excel.

Cada igreja roda **a sua própria instância** (um servidor, um banco). Não há multi-tenancy no código: separar os dados por instalação mantém o modelo simples e evita que um erro de filtro mostre os dados de uma comunidade para outra. Uma instalação nova leva cerca de 30 minutos num VPS barato (ver [DEPLOY.md](DEPLOY.md)).

---

## Sumário

- [Arquitetura](#arquitetura)
- [Stack](#stack)
- [Estrutura do código](#estrutura-do-código)
- [Modelo de dados](#modelo-de-dados)
- [API](#api)
- [Tela de contagem offline](#tela-de-contagem-offline)
- [Leitura da nota com IA](#leitura-da-nota-com-ia)
- [Relatório e Power BI](#relatório-e-power-bi)
- [Segurança](#segurança)
- [Rodando localmente](#rodando-localmente)
- [Deploy](#deploy)
- [Levando para outra igreja](#levando-para-outra-igreja)
- [Decisões de projeto](#decisões-de-projeto)
- [Limitações conhecidas e próximos passos](#limitações-conhecidas-e-próximos-passos)

---

## Arquitetura

Um monolito Flask atrás de um proxy HTTPS, com Postgres no mesmo host. Não há fila de tarefas, cache externo nem build de front-end.

```
                         ┌───────────────────────── VPS (docker compose) ─────────────────────────┐
navegador / celular ───► │ Caddy :443 (HTTPS automático) ──► app: gunicorn :8000 ──► db: Postgres 16 │
                         │                                     │        │                         │
                         │                                     │        └─► volume uploads (fotos)│
                         │                                     └─► API da OpenAI (só leitura de nota)
                         └──────────────────────────────────────────────────▲─────────────────────┘
                                                                            │ 127.0.0.1:5433
Power BI Desktop ── túnel SSH (ssh -L 5432:localhost:5433) ─────────────────┘  role "powerbi", só SELECT nas views
```

- **Toda regra de negócio fica na API JSON** (`/api/*`). As páginas Jinja são finas: renderizam o esqueleto e chamam a API com `fetch`.
- **O Power BI não usa a API.** Ele lê direto das views `vw_*` do Postgres, que são o contrato estável com o relatório. A página `/relatorio` e a exportação CSV leem as mesmas views, então o número do app é igual ao do Power BI.
- **O Postgres não é exposto na internet**: a porta só escuta em `127.0.0.1` e o acesso do BI é por túnel SSH.

## Stack

| Camada | Tecnologia |
| --- | --- |
| Back-end | Python 3.12, Flask 3 (blueprints), Flask-SQLAlchemy 3 / SQLAlchemy 2, psycopg 3 |
| Banco | PostgreSQL 16 |
| Front-end | Jinja + HTML, CSS e JavaScript puros (sem framework, sem bundler) |
| Login | Código numérico de 6 dígitos, hash `werkzeug.security`, Flask-Limiter |
| IA (opcional) | LangChain + OpenAI, saída estruturada validada com Pydantic |
| Servidor | gunicorn (`gthread`, 2 workers × 4 threads), Caddy 2 (TLS via Let's Encrypt) |
| Infra | Docker Compose em um VPS; backup por `cron` |
| BI | Power BI Desktop, conector PostgreSQL, modo Importação |

## Estrutura do código

```
.
├── app/
│   ├── __init__.py          # create_app(): config, extensões, blueprints, handlers de erro, /saude
│   ├── config.py            # lê o .env
│   ├── db.py                # instância do SQLAlchemy
│   ├── models.py            # Evento, Operador, Compra, ItemCompra, Distribuicao
│   ├── validacao.py         # leitura e validação dos campos do JSON (ErroValidacao -> 400)
│   ├── limitador.py         # instância do Flask-Limiter
│   ├── painel.py            # página inicial
│   ├── auth/                # /login, /logout, @login_required, comando criar-operador
│   ├── eventos/             # API de eventos (campanhas)
│   ├── compras/             # páginas + API de compras e itens
│   ├── distribuicao/        # tela de contagem + API de porções
│   ├── notas/               # upload/exibição da foto e rota de extração com IA
│   ├── LLM/extracao.py      # chamada ao modelo de visão e schema da nota
│   ├── relatorio/           # página /relatorio, JSON agregado e exportação ZIP
│   ├── templates/           # Jinja
│   └── static/              # css/estilo.css e js/ (um arquivo por tela + comum.js)
├── sql/
│   ├── schema.sql           # fonte da verdade do esquema
│   ├── views.sql            # contrato com o Power BI
│   └── powerbi.sql          # role somente leitura
├── scripts/backup.sh        # pg_dump + tar das fotos, guarda 14 dias
├── Dockerfile
├── docker-compose.yml       # db + app + caddy
├── Caddyfile
├── DEPLOY.md                # passo a passo de produção
└── run.py                   # ponto de entrada (flask / gunicorn)
```

Convenção: código, tabelas, rotas e variáveis em português, sem acento (`distribuicao`, `operador`, `clicado_em`).

## Modelo de dados

Cada dia de campanha é um **evento**. Compras e porções pertencem a um evento; operadores são globais à instalação.

```
evento 1 ──< compra 1 ──< item_compra
   │            │
   │            └── operador
   └──< distribuicao ── operador
```

| Tabela | Campos principais | Observações |
| --- | --- | --- |
| `evento` | `nome`, `data`, `local` | Um ponto de distribuição por evento. |
| `operador` | `nome`, `codigo_hash`, `ativo` | O código puro nunca é gravado. |
| `compra` | `evento_id`, `operador_id`, `data_compra`, `fornecedor`, `cnpj_emitente CHAR(14)`, `numero_nota`, `chave_acesso CHAR(44) UNIQUE`, `valor_total NUMERIC(10,2)`, `foto_path`, `origem_dados` | `origem_dados` ∈ `manual`, `qr`, `ia`. A `chave_acesso` única impede cadastrar a mesma NF-e duas vezes. |
| `item_compra` | `descricao`, `categoria`, `quantidade NUMERIC(10,3)`, `unidade`, `valor_unitario`, `valor_total` | `valor_total` é coluna gerada: `round(quantidade * valor_unitario, 2)`. `unidade` ∈ `kg`, `un`, `l`, `pct`. `ON DELETE CASCADE` a partir da compra. |
| `distribuicao` | `evento_id`, `operador_id`, `quantidade` (1 ou −1), `client_id UUID UNIQUE`, `clicado_em`, `registrado_em` | Log append-only da contagem. Ver abaixo. |

Algumas regras vivem no banco, não só na aplicação: `CHECK` em valores e unidades, coluna gerada para o total do item, `UNIQUE` na chave de acesso e no `client_id`. O app valida os mesmos campos antes (`app/validacao.py`) para devolver mensagens legíveis, com o campo exato do erro (`itens[2].quantidade`).

Dinheiro é sempre `NUMERIC`/`Decimal`. Os números chegam como string ou número e passam por `Decimal(str(x))` para não herdar imprecisão de `float`. O JS do formulário arredonda igual ao `round` do Postgres, para o total mostrado bater com o gravado.

### Desfazer nunca apaga

A contagem é um log de eventos: cada clique é uma linha com `quantidade = 1`, e desfazer grava outra linha com `quantidade = -1`. O total é `SUM(quantidade)`. Assim o histórico fica auditável e a sincronização offline vira um problema só de inserção, sem conflito de atualização.

## API

Todas as rotas exigem sessão, exceto `/login` e `/saude`. Sem sessão, `/api/*` responde `401` em JSON; as páginas redirecionam para `/login?proxima=<página>`.

Erros da API são sempre JSON: `{"erro": "mensagem", "campo": "nome_do_campo"}` para validação (`400`), e `{"erro": ...}` para `404`, `405`, `413`, `429` e `502`.

| Método | Rota | O que faz |
| --- | --- | --- |
| `GET` | `/saude` | Health check (faz `SELECT 1`) |
| `GET`, `POST` | `/login`, `GET /logout` | Login por código |
| `GET`, `POST` | `/api/eventos` | Lista / cria evento |
| `DELETE` | `/api/eventos/<id>` | Apaga o evento com compras, itens e porções, numa transação |
| `GET`, `POST` | `/api/compras[?evento_id=]` | Lista / cria compra com itens |
| `GET`, `PUT`, `DELETE` | `/api/compras/<id>` | Detalhe / substitui a compra e os itens / remove |
| `POST` | `/api/notas/upload` | Recebe a foto (`multipart`, campo `foto`, até 10 MB) e devolve `foto_path` |
| `POST` | `/api/notas/extrair` | Lê a foto com IA e devolve os campos para o formulário (não grava nada) |
| `GET` | `/notas/foto/<nome>` | Serve a foto (só nomes gerados pelo upload) |
| `POST` | `/api/distribuicoes` | Recebe um clique ou um lote da fila offline |
| `GET` | `/api/eventos/<id>/contador` | Total atual de porções |
| `GET` | `/api/relatorio?evento_id=` | Números agregados do evento (lê as views) |
| `GET` | `/api/relatorio/exportar[?evento_id=]` | ZIP com CSVs; sem `evento_id` exporta todos os eventos |

Páginas: `/` (painel), `/compras`, `/compras/nova`, `/compras/<id>/editar`, `/contagem/<evento_id>`, `/relatorio`.

### Exemplo: criar uma compra

```http
POST /api/compras
Content-Type: application/json

{
  "evento_id": 3,
  "data_compra": "2026-11-14",
  "fornecedor": "Mercado Central",
  "cnpj_emitente": "12.345.678/0001-90",
  "valor_total": "87,40",
  "foto_path": "9f1c...e2.jpg",
  "origem_dados": "ia",
  "itens": [
    {"descricao": "Batata", "quantidade": 5, "unidade": "kg", "valor_unitario": 6.98},
    {"descricao": "Macarrão", "quantidade": 10, "unidade": "pct", "valor_unitario": "5,25"}
  ]
}
```

A resposta (`201`) traz a compra com `soma_itens` e `diferenca` (valor da nota menos a soma dos itens), a mesma conferência que a view `vw_conferencia_notas` faz. CNPJ e chave de acesso aceitam pontuação e são gravados só com os dígitos. Nota repetida (mesma `chave_acesso`) volta como `400` no campo `chave_acesso`.

### Exemplo: enviar cliques

```http
POST /api/distribuicoes
Content-Type: application/json

[
  {"client_id": "0b6e...", "evento_id": 3, "quantidade": 1,  "clicado_em": "2026-11-15T21:03:12.481Z"},
  {"client_id": "7a2d...", "evento_id": 3, "quantidade": -1, "clicado_em": "2026-11-15T21:03:14.002Z"}
]
```

```json
{"confirmados": ["0b6e...", "7a2d..."], "rejeitados": []}
```

- Aceita um objeto ou uma lista (até 500 por requisição).
- Grava com `INSERT ... ON CONFLICT (client_id) DO NOTHING`: um clique reenviado é confirmado de novo, mas não conta duas vezes.
- Clique inválido ou de evento apagado volta em `rejeitados` com o motivo. O navegador tira os dois grupos da fila, porque um rejeitado nunca vai passar e travaria os envios seguintes.
- `clicado_em` mais de 10 minutos no futuro (relógio do notebook errado) é trocado pela hora do servidor, nunca recusado: recusar faria a porção sumir.

## Tela de contagem offline

É a parte crítica do dia da campanha: o Wi-Fi de salão de igreja cai, e cada porção precisa ser contada exatamente uma vez. Código em [app/static/js/contagem.js](app/static/js/contagem.js).

**Entrada**
- `Espaço` = +1, `Backspace` = −1, com feedback visual diferente para cada um. Botões grandes para toque.
- Ignora tecla segurada (`e.repeat`) e cliques a menos de 300 ms do anterior; `preventDefault()` evita rolar a página ou voltar no histórico.
- Não deixa o total ficar negativo.

**Sincronização**
1. Cada clique ganha um `client_id` (`crypto.randomUUID()`, com um gerador UUID v4 próprio como alternativa) e a hora do clique, e entra numa fila no `localStorage`.
2. O total na tela é otimista: último total confirmado pelo servidor + cliques pendentes deste evento.
3. A cada 3 s (e no evento `online`), um lote de até 200 cliques vai para `POST /api/distribuicoes`. Se ainda sobrar fila, o próximo lote sai na hora.
4. Só saem da fila os `client_id` que o servidor devolveu. Um clique feito enquanto o lote estava em trânsito continua na fila.
5. Se a resposta se perde, o lote é reenviado inteiro; o `UNIQUE` do `client_id` garante a idempotência.

**Robustez**
- A fila é relida do `localStorage` antes de cada alteração, então duas abas no mesmo navegador não apagam os cliques uma da outra (o evento `storage` mantém as telas em dia).
- Se o `localStorage` falhar (modo privado, cota), a fila passa para a memória e a tela avisa que fechar a aba perde os pendentes.
- Indicadores de online/offline, de cliques pendentes e do último envio. Sessão expirada (`401`) não redireciona: mostra o aviso e mantém os cliques guardados até o login ser refeito em outra aba.

## Leitura da nota com IA

Opcional, e projetada para nunca atrapalhar o cadastro manual.

- `POST /api/notas/extrair` recebe o `foto_path` de um upload anterior, manda a imagem para um modelo de visão (configurado em `MODELO_IA`, por exemplo `openai:<modelo>`) e pede saída estruturada no schema `NotaExtraida` (Pydantic): fornecedor, CNPJ, número, chave de acesso, data, total e itens com unidade restrita a `kg | un | l | pct`.
- O prompt manda devolver `null` para o que estiver ilegível, em vez de inventar.
- **A IA nunca grava.** A resposta só preenche o formulário; os campos preenchidos ficam destacados, o formulário compara o total da nota com a soma dos itens, e a pessoa revisa e salva. A compra fica marcada com `origem_dados = 'ia'`.
- Qualquer falha (rede, chave, crédito, foto ruim) vira `502` com mensagem amigável e é registrada no log; o formulário segue utilizável.
- O modelo é criado só na primeira leitura: sem `MODELO_IA` o app sobe normalmente.
- Limite de 20 leituras por minuto, porque cada chamada custa crédito. O gunicorn usa threads e timeout de 150 s para que uma leitura lenta não trave a tela de contagem.

## Relatório e Power BI

### Views ([sql/views.sql](sql/views.sql))

| View | Grão | Uso |
| --- | --- | --- |
| `vw_itens` | item comprado + dados da nota | o que foi comprado, quanto, de quem |
| `vw_distribuicao` | clique (+1/−1) com `hora` truncada no horário de Brasília | porções por hora |
| `vw_conferencia_notas` | nota: `valor_total`, `soma_itens`, `diferenca`, `tem_comprovante` | auditoria |
| `vw_resumo_evento` | evento: `total_gasto`, `qtd_compras`, `porcoes`, `custo_por_porcao` | indicadores principais |

O banco guarda horários em UTC (`timestamptz`); as views convertem com `AT TIME ZONE 'America/Sao_Paulo'`. `vw_resumo_evento` usa `CROSS JOIN LATERAL` para somar compras e cliques em subconsultas separadas, sem multiplicar linhas.

**As views são um contrato.** Renomear ou remover uma coluna quebra o `.pbix`. `CREATE OR REPLACE VIEW` permite reaplicar o arquivo quantas vezes for preciso.

### No app

`/relatorio` mostra totais, gasto por dia, gasto por fornecedor, itens agregados (mesmo nome e unidade viram uma linha), porções por hora e as notas que precisam de atenção (diferença entre total e itens, ou sem foto). Os gráficos são HTML/CSS puro.

`/api/relatorio/exportar` gera um ZIP com `resumo_eventos.csv`, `compras.csv`, `itens.csv` e `porcoes_por_hora.csv`, no padrão brasileiro (separador `;`, vírgula decimal, UTF-8 com BOM para o Excel ler os acentos).

### No Power BI

Conector PostgreSQL pelo túnel SSH, usuário `powerbi` (criado por [sql/powerbi.sql](sql/powerbi.sql), com `SELECT` só em `evento` e nas views; não enxerga `operador`), modo Importação. Medidas DAX previstas: Total Gasto, Porções, Custo por Porção e Notas com Diferença.

## Segurança

| Ameaça | Mitigação |
| --- | --- |
| Adivinhar códigos de login | Código de 6 dígitos com hash e sal; Flask-Limiter: 5 tentativas **erradas** por minuto por IP (acertos não contam, porque os operadores dividem o mesmo Wi-Fi). `ProxyFix` lê o IP real atrás do Caddy, ligado só com `ATRAS_DE_PROXY=1`. |
| Vazamento de código | Só o hash fica no banco; o comando `criar-operador` mostra o código uma única vez e evita repetir o código de outro operador ativo. |
| Sequestro de sessão / CSRF | Cookie `Secure` em produção, `SameSite=Lax`, sessão de 14 h, `session.clear()` no login. |
| Open redirect no `?proxima=` | `pagina_segura()` só aceita caminhos internos (começam com `/`, não com `//` nem `/\`). |
| Upload malicioso | Tipo detectado pelos bytes mágicos (JPG/PNG/WEBP), não pela extensão; nome gerado pelo servidor (UUID); 10 MB no máximo; `X-Content-Type-Options: nosniff` ao servir. |
| Path traversal | `foto_path` e `/notas/foto/<nome>` só aceitam o padrão `^[0-9a-f]{32}\.(jpg|png|webp)$`; a IA só lê arquivos com esse nome. |
| Banco exposto | Postgres em `127.0.0.1:5433`; BI por túnel SSH com role somente leitura. |
| Container | App roda como usuário sem privilégio (`sopao`). Segredos ficam no `.env`, fora do git. |

## Rodando localmente

Pré-requisitos: Python 3.12+, Docker.

```bash
python -m venv venv
source venv/bin/activate              # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

Crie um `.env` na raiz:

```ini
SECRET_KEY=troque-por-um-valor-aleatorio
DB_PASS=senha-local
DATABASE_URL=postgresql+psycopg://sopao:senha-local@localhost:5433/sopao
# Opcional, só para a leitura de nota com IA:
MODELO_IA=openai:<modelo>
OPENAI_API_KEY=sk-...
```

Suba o banco, aplique o esquema e as views, crie um operador e rode:

```bash
docker compose up -d db
docker compose exec -T db psql -U sopao -d sopao < sql/schema.sql
docker compose exec -T db psql -U sopao -d sopao < sql/views.sql

flask --app run.py criar-operador "Seu Nome"   # anote o código impresso
flask --app run.py run --debug                 # http://localhost:5000
```

### Variáveis de ambiente

| Variável | Obrigatória | Descrição |
| --- | --- | --- |
| `SECRET_KEY` | sim | Assina o cookie de sessão |
| `DATABASE_URL` | sim | URL SQLAlchemy (`postgresql+psycopg://...`); em produção o compose define |
| `DB_PASS` | compose | Senha do Postgres usada pelo `docker-compose.yml` |
| `DOMINIO` | produção | Domínio que o Caddy atende e para o qual emite o certificado |
| `SESSION_COOKIE_SECURE` | produção | `1` para cookie só em HTTPS (o compose define) |
| `ATRAS_DE_PROXY` | produção | `1` para confiar no `X-Forwarded-For` do Caddy (o compose define) |
| `UPLOAD_FOLDER` | não | Pasta das fotos (padrão `./uploads`) |
| `MODELO_IA`, `OPENAI_API_KEY` | não | Liga a leitura de nota com IA |

## Deploy

O passo a passo completo, com DNS, firewall, criação de operadores, backup e Power BI, está em [DEPLOY.md](DEPLOY.md). Em resumo:

```bash
git clone <repo> sopao && cd sopao
nano .env                                   # SECRET_KEY, DB_PASS, DOMINIO, MODELO_IA, OPENAI_API_KEY
docker compose up -d db
docker compose exec -T db psql -U sopao -d sopao < sql/schema.sql
docker compose exec -T db psql -U sopao -d sopao < sql/views.sql
docker compose up -d --build                # Caddy obtém o certificado sozinho
docker compose exec app flask --app run.py criar-operador "Nome"
```

Backup diário às 3h com [scripts/backup.sh](scripts/backup.sh): `pg_dump` compactado e `tar` do volume de fotos, mantendo 14 dias. O backup fica no próprio servidor; baixe uma cópia periodicamente.

Dois problemas encontrados no primeiro deploy, que podem se repetir em outros provedores:
- VPS que já vem com nginx ocupando as portas 80/443: `systemctl disable --now nginx`.
- Containers sem DNS (o host usa `127.0.0.53`): criar `/etc/docker/daemon.json` com `{"dns": ["1.1.1.1", "8.8.8.8"]}` e reiniciar o Docker.

Não atualize o sistema no dia da campanha.

## Levando para outra igreja

Cada comunidade recebe uma instalação independente:

1. Um VPS (1 vCPU e 1–2 GB de RAM bastam) e um domínio ou subdomínio (ex.: `sopao.paroquia-exemplo.org.br`).
2. Clone do repositório e um `.env` próprio, com `SECRET_KEY` e `DB_PASS` novos. A chave da OpenAI pode ser da própria igreja ou ficar de fora.
3. Seguir o [DEPLOY.md](DEPLOY.md) e criar os operadores daquela equipe.
4. Se a igreja quiser o Power BI, criar a role `powerbi` com senha própria e entregar o `.pbix` apontando para o túnel.

Os dados de uma instalação não chegam às outras. Atualizações de código são um `git pull` seguido de `docker compose up -d --build` em cada servidor, aplicando antes o SQL de qualquer mudança de esquema.

## Decisões de projeto

- **Monolito sem build de JS.** A equipe é pequena e o prazo do núcleo foi de dois dias. Flask + Jinja + JS puro deixa o sistema fácil de ler, depurar e manter por voluntários.
- **Lógica na API, páginas finas.** A mesma API serve as telas e poderia servir um app móvel ou integração futura, sem duplicar regras.
- **Views como contrato do BI** em vez de o Power BI consumir a API: o modo Importação lê tabelas com eficiência, a role só de leitura limita o que o BI vê, e o app usa as mesmas views no relatório, evitando dois cálculos diferentes do mesmo número.
- **Contagem como log append-only com chave de idempotência** gerada no cliente: é o jeito mais simples de ter sincronização offline correta sem lógica de merge.
- **Login por código numérico** em vez de usuário e senha: o operador digita rápido no celular ou no notebook do salão. O risco de força bruta é coberto pelo limite de tentativas.
- **IA como assistente, nunca como fonte final.** Notas fiscais em papel térmico saem borradas e o modelo erra; a revisão humana e a conferência total × itens tratam isso.
- **Postgres faz o que sabe fazer**: colunas geradas, `CHECK`, `UNIQUE` e `ON CONFLICT` garantem integridade mesmo que um bug passe pela validação do app.

## Limitações conhecidas e próximos passos

**Limitações**
- Uma instalação por igreja; não há separação de dados por organização dentro do mesmo banco.
- Não há perfis de permissão: qualquer operador logado pode cadastrar, editar e excluir compras e eventos.
- Um ponto de distribuição por evento (não há coluna `posto`; se precisar, entra com `ALTER TABLE`).
- O limite de login é guardado em memória, por worker do gunicorn: o teto real é 5 tentativas por minuto por worker. Suficiente para o uso atual; com mais servidores, mudar para um armazenamento compartilhado.
- Excluir um evento apaga os registros mas mantém as fotos na pasta de uploads.
- O repositório ainda não tem testes automatizados; o back-end foi testado manualmente contra o banco local e com o cliente de testes do Flask.
- `app/compras/api.py` tem uma rota `POST /api/compras/anexarcompras` ainda não implementada (corpo vazio); deve ser removida ou implementada.

**Próximos passos**
- Testes automatizados (pytest com um Postgres de teste) para a API de compras, a idempotência da distribuição e as views.
- Leitura do QR code da NFC-e para preencher chave, número e CNPJ sem IA (`origem_dados = 'qr'` já existe no esquema).
- Montar e versionar o `.pbix` com as medidas DAX.
- Perfis de operador (por exemplo, só contagem vs. administração).
