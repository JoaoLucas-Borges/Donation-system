# Deploy do Sopão

No final você terá o sistema em `https://sopao.seudominio.com.br`, com HTTPS automático,
banco Postgres no próprio servidor e backup diário.

```
internet ──► Caddy (80/443, HTTPS) ──► app (gunicorn :8000) ──► db (Postgres)
                                           │
                                           └─► volume "uploads" (fotos das notas)
```

Troque `seudominio.com.br` pelo seu domínio e `IP-DO-VPS` pelo IP do servidor em todos os comandos.

---

## 1. Contratar o VPS

Qualquer provedor serve (Hetzner, DigitalOcean, Contabo, Hostinger, Vultr, Magalu Cloud...). Escolha:

- **Sistema:** Ubuntu 24.04 LTS
- **Tamanho:** 1 vCPU, 1 a 2 GB de RAM, 20 GB de disco (o plano mais barato costuma bastar)
- **Acesso:** se o painel oferecer, cadastre uma chave SSH; senão, use a senha de root que ele mostrar

Anote o **IP público** do servidor.

## 2. Apontar o domínio para o servidor (DNS)

No painel onde você comprou o domínio (Registro.br, Hostinger, GoDaddy...), na parte de **DNS**, crie:

| Tipo | Nome | Valor | TTL |
|---|---|---|---|
| A | `sopao` | `IP-DO-VPS` | padrão |

Isso cria `sopao.seudominio.com.br`. Pode levar de minutos a algumas horas para valer.
Para conferir, no seu computador: `nslookup sopao.seudominio.com.br`. Tem que aparecer o IP do VPS.

> **Faça isso antes do passo 6.** O Caddy só consegue o certificado HTTPS quando o domínio já aponta para o servidor.

## 3. Preparar o servidor

No seu computador:

```bash
ssh root@IP-DO-VPS
```

Já dentro do servidor:

```bash
apt update && apt upgrade -y
curl -fsSL https://get.docker.com | sh          # instala Docker + docker compose

# Firewall: só SSH e web abertos
ufw allow OpenSSH
ufw allow 80
ufw allow 443
ufw enable
```

O Postgres fica preso em `127.0.0.1` no `docker-compose.yml`, então não aparece na internet mesmo com o Docker passando por cima do ufw.

## 4. Baixar o código

Antes, **no seu computador**, faça commit e `git push` de tudo (Dockerfile, Caddyfile etc.).

No servidor:

```bash
git clone https://github.com/JoaoLucas-Borges/Donation-system.git sopao
cd sopao
```

Se o repositório for privado, o git pede usuário e senha: use seu usuário do GitHub e, como senha,
um **token** (GitHub → Settings → Developer settings → Personal access tokens, permissão só de leitura no repositório).

## 5. Criar o `.env` do servidor

O `.env` não vai pelo git. Crie um novo **com senhas novas** (não reaproveite as do seu computador):

```bash
python3 -c "import secrets; print(secrets.token_hex(32))"   # rode 2 vezes: uma para SECRET_KEY, outra para DB_PASS
nano .env
```

Conteúdo:

```
SECRET_KEY=<primeiro valor gerado>
DB_PASS=<segundo valor gerado>
DOMINIO=sopao.seudominio.com.br
MODELO_IA=openai:gpt-6-luna
OPENAI_API_KEY=sk-...
```

Salve (Ctrl+O, Enter, Ctrl+X) e proteja o arquivo:

```bash
chmod 600 .env
```

`DATABASE_URL`, `SESSION_COOKIE_SECURE` e `ATRAS_DE_PROXY` já vêm do `docker-compose.yml`. Não precisa pôr aqui.

## 6. Subir o banco, criar as tabelas e subir o resto

```bash
docker compose up -d db
sleep 5
docker compose exec -T db psql -U sopao -d sopao < sql/schema.sql
docker compose exec -T db psql -U sopao -d sopao < sql/views.sql

docker compose up -d --build
docker compose logs -f caddy      # espere aparecer "certificate obtained successfully"; Ctrl+C para sair
```

O banco do servidor começa **vazio**: os dados de teste do seu computador não vão junto.

## 7. Criar os operadores

Um por pessoa. Cada comando imprime o código de 6 dígitos **uma única vez**. Anote e entregue para a pessoa.

```bash
docker compose exec app flask --app run.py criar-operador "Nome da Pessoa"
```

## 8. Testar

Abra `https://sopao.seudominio.com.br` no navegador e no celular:

- [ ] Cadeado de HTTPS aparece
- [ ] Login com um código criado no passo 7
- [ ] Criar um evento, cadastrar uma compra com foto, **Ler nota com IA**
- [ ] Tela de contagem: espaço soma, Backspace desfaz; desligue o Wi-Fi, conte, religue e veja os pendentes sumirem
- [ ] `/relatorio` mostra os números

## 9. Backup diário

```bash
chmod +x scripts/backup.sh
./scripts/backup.sh               # teste uma vez na mão
ls -lh backups/                   # devem aparecer banco-AAAA-MM-DD.sql.gz e fotos-AAAA-MM-DD.tar.gz

crontab -e                        # escolha o nano e adicione a linha abaixo no final:
0 3 * * * /root/sopao/scripts/backup.sh >> /root/sopao/backups/log.txt 2>&1
```

Isso roda todo dia às 3h e guarda 14 dias. O backup fica **no mesmo servidor**. De vez em quando
(e sempre depois do dia da campanha), baixe uma cópia para o seu computador:

```bash
scp -r root@IP-DO-VPS:sopao/backups ./backups-vps
```

Restaurar o banco, se precisar: `gunzip -c backups/banco-AAAA-MM-DD.sql.gz | docker compose exec -T db psql -U sopao -d sopao`
(num banco vazio).

## 10. Power BI

Crie o usuário só-leitura (uma vez):

```bash
docker compose exec -T db psql -U sopao -d sopao -v senha='UMA-SENHA-FORTE' < sql/powerbi.sql
```

No seu computador, abra o túnel e deixe o terminal aberto enquanto usa o Power BI:

```bash
ssh -L 5432:localhost:5433 root@IP-DO-VPS
```

No Power BI: PostgreSQL, servidor `localhost`, banco `sopao`, usuário `powerbi`, modo Importação.

## Atualizar o sistema depois de mudar o código

No seu computador: commit e push. No servidor:

```bash
cd ~/sopao
git pull
docker compose up -d --build
```

Se mudou o banco (`schema.sql`/`views.sql`), aplique o SQL da mudança antes do `up`.
**Não atualize no dia da campanha.**

## Problemas comuns

| Sintoma | O que fazer |
|---|---|
| Navegador avisa que o site não é seguro | DNS ainda não propagou. Confira o `nslookup` e veja `docker compose logs caddy` |
| `502 Bad Gateway` | O app caiu: `docker compose logs app --tail 50` |
| "A IA não conseguiu ler esta nota." | `docker compose logs app` mostra o erro real (chave, crédito, modelo) |
| Login diz "muitas tentativas" para todo mundo | Confira se `ATRAS_DE_PROXY: "1"` está no `docker-compose.yml` |
| Ver o que está rodando | `docker compose ps` |
