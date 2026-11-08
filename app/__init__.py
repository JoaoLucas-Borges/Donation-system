from flask import Flask

from app.config import Config
from app.db import db


def create_app(config=Config):
    app = Flask(__name__)
    app.config.from_object(config)

    db.init_app(app)

    # Importa os modelos para o SQLAlchemy conhecer as tabelas
    from app import models  # noqa: F401

    @app.get("/saude")
    def saude():
        db.session.execute(db.text("SELECT 1"))
        return {"status": "ok"}

    return app
