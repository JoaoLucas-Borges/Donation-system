from flask import Flask, render_template, request
from werkzeug.exceptions import HTTPException, RequestEntityTooLarge, TooManyRequests
from werkzeug.middleware.proxy_fix import ProxyFix

from app.config import Config
from app.db import db
from app.limitador import limitador
from app.validacao import ErroValidacao


def create_app(config=Config):
    app = Flask(__name__)
    app.config.from_object(config)

    db.init_app(app)
    limitador.init_app(app)

    if app.config["ATRAS_DE_PROXY"]:
        app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)

    # Importa os modelos para o SQLAlchemy conhecer as tabelas
    from app import models  # noqa: F401

    # API (JSON)
    from app.compras.api import bp as compras_api
    from app.distribuicao.api import bp as distribuicao_api
    from app.eventos.api import bp as eventos_api
    from app.notas.api import bp as notas

    app.register_blueprint(eventos_api)
    app.register_blueprint(compras_api)
    app.register_blueprint(distribuicao_api)
    app.register_blueprint(notas)

    # Páginas (HTML)
    from app.auth.rotas import bp as auth
    from app.compras.paginas import bp as compras
    from app.distribuicao.paginas import bp as distribuicao
    from app.painel import bp as painel

    app.register_blueprint(auth)
    app.register_blueprint(painel)
    app.register_blueprint(compras)
    app.register_blueprint(distribuicao)

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

    @app.errorhandler(RequestEntityTooLarge)
    def arquivo_grande(erro):
        return {"erro": "Arquivo maior que 10 MB.", "campo": "foto"}, 413

    @app.errorhandler(TooManyRequests)
    def muitas_tentativas(erro):
        mensagem = "Muitas tentativas erradas. Espere 1 minuto e tente de novo."
        if request.path.startswith("/api/"):
            return {"erro": mensagem}, 429
        return render_template("login.html", erro=mensagem), 429

    @app.errorhandler(HTTPException)
    def erro_http(erro):
        # Na API, erros como 404 e 405 saem em JSON em vez da página HTML do Flask
        if request.path.startswith("/api/"):
            return {"erro": erro.description}, erro.code
        return erro
