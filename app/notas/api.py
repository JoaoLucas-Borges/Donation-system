"""Upload e exibição da foto da nota fiscal.

Fase 2: a extração dos dados com IA vai ler o arquivo salvo aqui
(pelo foto_path) e devolver os campos para revisão antes de salvar.
"""
import os
import re
import uuid

from flask import Blueprint, abort, current_app, request, send_from_directory

from app import validacao as v
from app.auth.decorators import login_required

bp = Blueprint("notas", __name__)

# Nome que o próprio upload gera: 32 letras hexadecimais + extensão.
# A compra só aceita foto_path nesse formato, então ninguém consegue
# apontar para outro arquivo do servidor.
NOME_FOTO = re.compile(r"^[0-9a-f]{32}\.(jpg|png|webp)$")


def tipo_da_imagem(cabecalho):
    """Descobre o tipo pelos primeiros bytes, não pelo nome do arquivo."""
    if cabecalho[:3] == b"\xff\xd8\xff":
        return "jpg"
    if cabecalho[:8] == b"\x89PNG\r\n\x1a\n":
        return "png"
    if cabecalho[:4] == b"RIFF" and cabecalho[8:12] == b"WEBP":
        return "webp"
    return None


@bp.post("/api/notas/upload")
@login_required
def upload():
    arquivo = request.files.get("foto")
    if arquivo is None or not arquivo.filename:
        raise v.ErroValidacao("foto", "Escolha uma foto.")

    cabecalho = arquivo.stream.read(12)
    arquivo.stream.seek(0)
    extensao = tipo_da_imagem(cabecalho)
    if extensao is None:
        raise v.ErroValidacao("foto", "Envie uma imagem JPG, PNG ou WEBP.")

    pasta = current_app.config["UPLOAD_FOLDER"]
    os.makedirs(pasta, exist_ok=True)
    nome = f"{uuid.uuid4().hex}.{extensao}"
    arquivo.save(os.path.join(pasta, nome))
    return {"foto_path": nome}, 201


@bp.get("/notas/foto/<nome>")
@login_required
def foto(nome):
    if not NOME_FOTO.match(nome):
        abort(404)
    resposta = send_from_directory(current_app.config["UPLOAD_FOLDER"], nome)
    resposta.headers["X-Content-Type-Options"] = "nosniff"
    return resposta
