# Deploy do Sopão

No final você terá o sistema em `https://sopao.seudominio.com.br`, com HTTPS automático,
banco Postgres no próprio servidor e backup diário.

```
internet ──► Caddy (80/443, HTTPS) ──► app (gunicorn :8000) ──► db (Postgres)
                                           │
                                           └─► volume "uploads" (fotos das notas)
```

Troque `seudominio.com.br` pelo seu domínio e `IP-DO-VPS` pelo IP do servidor em todos os comandos.

Cada igreja tem a sua própria instalação: para levar o Sopão a outra comunidade, repita este guia
num servidor novo, com domínio, `.env` e operadores próprios.

---

## 1. Contratar o VPS

Qualquer provedor serve (Locaweb, Hostinger, Hetzner, DigitalOcean, Contabo, Vultr, Magalu Cloud...). Escolha:

- **Sistema:** Ubuntu 24.04 LTS ou mais novo
- **Tamanho:** 1 vCPU, 1 a 2 GB de RAM, 20 GB de disco (o plano mais barato costuma bastar)
- **Acesso:** se o painel oferecer, cadastre uma chave SSH; senão, use a senha de root que ele mostrar

Anote o **IP público** do servidor.

## 2. Apontar o domínio para o servidor (DNS)

No painel onde você comprou o domínio (Registro.br, Hostinger, GoDaddy...), na parte de **DNS**, crie:

| Tipo | Nome | Valor | TTL |
|---|---|---|---|
| A | `sopao` | `IP-DO-VPS` | padrão |

Isso cria `sopao.seudominio.com.br`. Se o domínio inteiro for só do Sopão (ex.: `sopao.online`),
use `@` no nome em vez de `sopao`.

Pode levar de minutos a algumas horas para valer. Para conferir, no seu computador:
`nslookup sopao.seudominio.com.br`. Tem que aparecer o IP do VPS.

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

### 3.1 Liberar as portas 80 e 443

Alguns provedores entregam o VPS com nginx ou Apache já rodando, e o Caddy não consegue subir. Confira:

```bash
ss -ltnp | grep -E ':80 |:443 '
```

Se aparecer `nginx` (ou `apache2`), desligue de vez:

```bash
systemctl disable --now nginx        # ou: systemctl disable --now apache2
```

### 3.2 DNS dentro dos containers

Em alguns VPS o sistema usa `127.0.0.53` como DNS, e os containers não conseguem resolver nomes
(o `pip install` do build falha, o Caddy não pega o certificado e a leitura com IA não alcança a OpenAI).
Para evitar, aponte o Docker para DNS públicos:

```bash
cat > /etc/docker/daemon.json <<'EOF'
{"dns": ["1.1.1.1", "8.8.8.8"]}
EOF
systemctl restart docker
```

Para testar: `docker run --rm busybox nslookup api.openai.com` tem que responder com endereços.

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

`MODELO_IA` e `OPENAI_API_KEY` são opcionais: sem eles o sistema funciona normalmente, só o botão
"Ler nota com IA" responde com erro.

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

Para conferir se o app está de pé: `curl -s https://sopao.seudominio.com.br/saude` deve responder `{"status":"ok"}`.

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
- [ ] `/relatorio` mostra os números e a exportação baixa o ZIP
- [ ] Excluir o evento de teste no painel antes da campanha de verdade

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

Crie o usuário só-leitura (uma vez; rodar de novo só troca a senha):

```bash
docker compose exec -T db psql -U sopao -d sopao -v senha='UMA-SENHA-FORTE' < sql/powerbi.sql
```

No seu computador, abra o túnel e deixe o terminal aberto enquanto usa o Power BI:

```bash
ssh -L 5432:localhost:5433 root@IP-DO-VPS
```

No Power BI: PostgreSQL, servidor `localhost`, banco `sopao`, usuário `powerbi`, modo Importação.
Esse usuário só enxerga a tabela `evento` e as views `vw_*`.

Sem Power BI, dá para usar a exportação do próprio app: `/relatorio` → exportar (ZIP de CSVs que abre no Excel).

## Atualizar o sistema depois de mudar o código

No seu computador: commit e push. No servidor:

```bash
cd ~/sopao
git pull
docker compose up -d --build
```

Se mudou o banco (`schema.sql`/`views.sql`), aplique o SQL da mudança antes do `up`.
`views.sql` pode ser rodado de novo sem problema:

```bash
docker compose exec -T db psql -U sopao -d sopao < sql/views.sql
```

**Não atualize no dia da campanha.**

## Problemas comuns

| Sintoma | O que fazer |
|---|---|
| Navegador avisa que o site não é seguro | DNS ainda não propagou. Confira o `nslookup` e veja `docker compose logs caddy` |
| Caddy não sobe, "address already in use" | Outro servidor web ocupa 80/443. Veja o passo 3.1 |
| Build falha no `pip install` ou Caddy não pega certificado com erro de DNS | Containers sem DNS. Veja o passo 3.2 |
| `502 Bad Gateway` | O app caiu: `docker compose logs app --tail 50` |
| "A IA não conseguiu ler esta nota." | `docker compose logs app` mostra o erro real (chave, crédito, modelo, DNS) |
| Login diz "muitas tentativas" para todo mundo | Confira se `ATRAS_DE_PROXY: "1"` está no `docker-compose.yml` |
| Ver o que está rodando | `docker compose ps` |
