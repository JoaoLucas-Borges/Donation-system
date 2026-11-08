import os
from datetime import timedelta

from dotenv import load_dotenv

load_dotenv()

PASTA_PROJETO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class Config:
    SECRET_KEY = os.environ["SECRET_KEY"]
    SQLALCHEMY_DATABASE_URI = os.environ["DATABASE_URL"]
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # Sessão de login vale pelo dia da campanha
    PERMANENT_SESSION_LIFETIME = timedelta(hours=14)
    # Lax: o navegador não manda o cookie de login em POSTs vindos de outros sites
    SESSION_COOKIE_SAMESITE = "Lax"
    # Em produção (HTTPS pelo Caddy), defina SESSION_COOKIE_SECURE=1 no .env
    SESSION_COOKIE_SECURE = os.environ.get("SESSION_COOKIE_SECURE") == "1"

    # Em produção o Caddy fica na frente do Flask. Com ATRAS_DE_PROXY=1 no .env,
    # o Flask lê o IP real do cliente no cabeçalho X-Forwarded-For (o limite
    # de login depende disso). Não ligue sem proxy: o cliente poderia forjar o IP.
    ATRAS_DE_PROXY = os.environ.get("ATRAS_DE_PROXY") == "1"

    # Fotos das notas fiscais
    UPLOAD_FOLDER = os.environ.get("UPLOAD_FOLDER", os.path.join(PASTA_PROJETO, "uploads"))
    MAX_CONTENT_LENGTH = 10 * 1024 * 1024  # 10 MB por requisição
