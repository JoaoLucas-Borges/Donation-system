#!/bin/sh
# Backup diário do Sopão: banco (pg_dump) + fotos das notas.
# Roda no servidor, pelo cron (ver DEPLOY.md). Guarda os últimos 14 dias.
set -eu

cd "$(dirname "$0")/.."
mkdir -p backups
DATA=$(date +%F)

# Banco inteiro em SQL compactado
docker compose exec -T db pg_dump -U sopao -d sopao | gzip > "backups/banco-$DATA.sql.gz"

# Fotos: copia o volume de uploads para um .tar.gz
docker compose run --rm --no-deps --user root -v "$(pwd)/backups:/backup" --entrypoint tar app \
  czf "/backup/fotos-$DATA.tar.gz" -C /app/uploads .

# Apaga backups com mais de 14 dias
find backups -name "*.gz" -mtime +14 -delete
