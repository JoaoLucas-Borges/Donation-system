# Imagem do app Sopão: Flask servido pelo gunicorn.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Dependências primeiro: se só o código mudar, o Docker reaproveita esta camada
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Roda sem ser root; a pasta de fotos pertence a esse usuário
RUN useradd --create-home sopao && mkdir -p /app/uploads && chown -R sopao /app/uploads
USER sopao

EXPOSE 8000

# gthread: 2 processos x 4 threads. Enquanto uma leitura de nota com IA
# espera a OpenAI, as outras threads continuam atendendo a tela de contagem.
# timeout 150: a leitura com IA pode levar mais que os 30 s padrão do gunicorn.
CMD ["gunicorn", "--bind", "0.0.0.0:8000", "--workers", "2", "--threads", "4", \
     "--worker-class", "gthread", "--timeout", "150", "--access-logfile", "-", "run:app"]
