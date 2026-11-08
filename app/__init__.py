from flask import Flask, request
from werkzeug.exceptions import HTTPException

from app.config import Config
from app.db import db
from app.validacao import ErroValidacao


def create_app(config=Config):
    app = Flask(__name__)
    app.config.from_object(config)

    db.init_app(app)

    # Importa os modelos para o SQLAlchemy conhecer as tabelas
    from app import models  # noqa: F401

    from app.compras.api import bp as compras_api
    from app.eventos.api import bp as eventos_api

    app.register_blueprint(eventos_api)
    app.register_blueprint(compras_api)

    from app.auth.comandos import criar_operador

    app.cli.add_command(criar_operador)

    registrar_erros(app)

    @app.get("/saude")
    def saude():
        db.session.execute(db.text("SELECT 1"))
        return {"status": "ok"}

    return app


def registrar_erros(app):
    @app.errorhandler(ErroValidacao)
    def erro_validacao(erro):
        return {"erro": erro.mensagem, "campo": erro.campo}, 400

    @app.errorhandler(HTTPException)
    def erro_http(erro):
        # Na API, erros como 404 e 405 saem em JSON em vez da página HTML do Flask
        if request.path.startswith("/api/"):
            return {"erro": erro.description}, erro.code
        return erro
